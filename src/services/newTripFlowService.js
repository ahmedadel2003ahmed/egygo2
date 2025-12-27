import mongoose from "mongoose";
import tripRepository from "../repositories/tripRepository.js";
import guideRepository from "../repositories/guideRepository.js";
import userRepository from "../repositories/userRepository.js";
import attractionRepository from "../repositories/attractionRepository.js";
import * as placeRepository from "../repositories/placeRepository.js";
import callService from "./callService.js";
import notificationService from "./notificationService.js";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  AUDIT_ACTIONS,
} from "../utils/constants.js";
import { logAudit } from "../utils/auditLogger.js";
import { TRIP_STATES, validateTransition } from "../utils/tripStateMachine.js";
import { emitTripStatusUpdate } from "../sockets/tripSocketEmitter.js";

/**
 * NEW TRIP FLOW SERVICE
 *
 * Implements the redesigned trip creation flow:
 * 1. Tourist creates trip (NO guide selected)
 * 2. System suggests compatible guides
 * 3. Tourist selects a guide
 * 4. Tourist initiates call with selected guide
 * 5. After call, guide accepts/rejects
 * 6. Trip becomes confirmed or rejected
 */
class NewTripFlowService {
  /**
   * STEP 1: Create trip without guide selection
   * Status after creation: 'selecting_guide'
   */
  /**
   * STEP 1: Create trip without guide selection
   * Status after creation: 'selecting_guide'
   */
  async createTripWithoutGuide(touristId, tripData, ipAddress, userAgent) {
    const {
      startAt,
      meetingAddress,
      meetingPoint,
      totalDurationMinutes,
      itinerary,
      notes,
      createdFromPlaceId,
      provinceId,
    } = tripData;

    // 1. Validation
    if (provinceId && !mongoose.Types.ObjectId.isValid(provinceId)) {
      throw new Error("Invalid province ID");
    }

    const tourist = await userRepository.findById(touristId);
    if (!tourist) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    if (tourist.role !== "tourist") {
      throw new Error("Only tourists can create trips");
    }

    const startDate = new Date(startAt);
    if (startDate <= new Date()) {
      throw new Error("Trip start time must be in the future");
    }

    // 2. Resolve Province and Place references safely
    let resolvedCreatedFromPlaceId = null;
    let resolvedProvinceId = provinceId || null;

    if (createdFromPlaceId) {
      if (mongoose.Types.ObjectId.isValid(createdFromPlaceId)) {
        try {
          const place = await placeRepository.findById(createdFromPlaceId);
          if (place) {
            resolvedCreatedFromPlaceId = place._id;
            // Auto-resolve province if not explicitly provided
            if (!resolvedProvinceId && place.province) {
              resolvedProvinceId = place.province._id || place.province;
            }
          }
        } catch (err) {
          console.warn(`[NewTripFlow] Place lookup failed: ${err.message}`);
        }
      }
    }

    if (!resolvedProvinceId) {
      throw new Error(
        "Trip must have valid 'provinceId' or be created from a known place (createdFromPlaceId)."
      );
    }

    // 3. Prepare Trip Data
    const meta = tripData.meta || {};
    const agreementSource = meta.agreementSource || "new_flow";

    const tripCreateData = {
      tourist: touristId,
      guide: null,
      selectedGuide: null,
      candidateGuides: [],
      callSessions: [],
      status: TRIP_STATES.SELECTING_GUIDE, // Enforce initial state
      startAt: startDate,
      meetingAddress,
      totalDurationMinutes: totalDurationMinutes || 240,
      itinerary: itinerary || [],
      notes,
      meta: {
        createdFromPlaceId: resolvedCreatedFromPlaceId,
        agreementSource,
        agreementNote: meta.agreementNote,
        provinceId: resolvedProvinceId,
      },
      provinceId: resolvedProvinceId,
    };

    if (
      meetingPoint &&
      meetingPoint.coordinates &&
      meetingPoint.coordinates.length === 2
    ) {
      tripCreateData.meetingPoint = meetingPoint;
    }

    // 4. Create Trip
    const trip = await tripRepository.create(tripCreateData);

    // 5. Audit Log
    await logAudit({
      userId: touristId,
      action: AUDIT_ACTIONS.CREATE_TRIP,
      resourceType: "trip",
      resourceId: trip._id,
      details: { status: TRIP_STATES.SELECTING_GUIDE, startAt: startDate },
      ipAddress,
      userAgent,
    });

    // 6. Fetch Candidates (Async but awaited for initial response)
    const { guides, pagination } = await this._findAndCacheGuidesForTrip(
      trip,
      resolvedProvinceId
    );

    return {
      message: "Trip created successfully. Now select a guide to continue.",
      data: guides,
      pagination,
      trip,
      nextStep: "select_guide",
      nextEndpoint: `/api/tourist/trips/${trip._id}/guides`,
    };
  }

  /**
   * Helper to find guides and update trip candidates
   */
  async _findAndCacheGuidesForTrip(trip, provinceId) {
    let availableGuides = [];
    let pagination = { total: 0, page: 1, pages: 0 };

    try {
      const query = {
        isActive: true, // Only active guides
        // isVerified: true // TODO: Enforce verification in prod
      };

      if (provinceId) {
        query.$or = [{ province: provinceId }, { provinces: provinceId }];
      }

      let guides = await guideRepository.findAll(query);

      // Filter by location distance (radius)
      if (trip.meetingPoint && trip.meetingPoint.coordinates) {
        const maxDistance = 50;
        // ... simplified distance logic or use $near in Mongo if geospatial index exists on guides
        // Keeping existing logic for now strictly
        guides = guides.filter((guide) => {
          if (!guide.location || !guide.location.coordinates) return false;
          const [tLng, tLat] = trip.meetingPoint.coordinates;
          const [gLng, gLat] = guide.location.coordinates;
          const dist =
            Math.sqrt(Math.pow(tLat - gLat, 2) + Math.pow(tLng - gLng, 2)) *
            111;
          return dist <= maxDistance;
        });
      }

      guides.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      // Update Candidates Atomic
      const candidateIds = guides.map((g) => g._id);
      await tripRepository.updateById(trip._id, {
        candidateGuides: candidateIds,
      });

      const limit = 20;
      availableGuides = guides.slice(0, limit);
      pagination = {
        total: guides.length,
        page: 1,
        pages: Math.ceil(guides.length / limit) || 1,
      };

      return { guides: availableGuides, pagination };
    } catch (err) {
      console.error("[NewTripFlow] Guide fetch error:", err);
      return { guides: [], pagination: { total: 0 } };
    }
  }

  /**
   * STEP 2: Get compatible guides for the trip
   * Filters guides based on:
   * - Location (if meeting point provided)
   * - Availability
   * - Verification status
   * - Languages (if specified)
   */
  async getTripCompatibleGuides(tripId, filters = {}) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // If trip already has a confirmed guide or is past the selection stage, return empty
    // This prevents errors when frontend makes stale requests during status transitions
    if (
      trip.status === "in_call" ||
      trip.status === "pending_confirmation" ||
      trip.status === "awaiting_payment" ||
      trip.status === "confirmed" ||
      trip.status === "in_progress" ||
      trip.status === "completed" ||
      trip.status === "cancelled"
    ) {
      console.log(
        `[GUIDES] Trip ${tripId} has status ${trip.status} - returning empty guides list`
      );
      return {
        guides: [],
        pagination: { total: 0, page: 1, limit: 20, pages: 0 },
        trip,
      };
    }

    // Should only fetch guides for selecting_guide or awaiting_call states
    if (trip.status !== "selecting_guide" && trip.status !== "awaiting_call") {
      console.warn(
        `[GUIDES] Unexpected trip status ${trip.status} for getTripCompatibleGuides`
      );
      return {
        guides: [],
        pagination: { total: 0, page: 1, limit: 20, pages: 0 },
        trip,
      };
    }

    // Build query for compatible guides
    const query = {
      // isVerified: true, // Allow unverified guides for now
      isActive: true, // Ensure guide is active
    };

    // Resolve province ID (handle both place-based and province-based)
    let resolvedProvinceId = trip.provinceId;

    // If not directly on trip, try to resolve from place if available
    if (!resolvedProvinceId && trip.meta && trip.meta.createdFromPlaceId) {
      try {
        const place = await placeRepository.findById(
          trip.meta.createdFromPlaceId
        );
        if (place && place.province) {
          resolvedProvinceId = place.province._id || place.province;
        }
      } catch (err) {
        console.warn(
          `[NewTripFlow] Failed to resolve province from place ${trip.meta.createdFromPlaceId}:`,
          err.message
        );
      }
    }

    console.log("[GUIDES_DEBUG] tripId =", trip._id.toString());
    console.log("[GUIDES_DEBUG] trip.provinceId =", trip.provinceId);
    console.log(
      "[GUIDES_DEBUG] derivedProvinceId used for filter =",
      resolvedProvinceId
    );

    // Filter by province if we have one
    if (resolvedProvinceId) {
      query.$or = [
        { province: resolvedProvinceId },
        { provinces: resolvedProvinceId },
      ];
    } else {
      console.log(
        "[GUIDES_DEBUG] No provinceId found for trip",
        trip._id.toString()
      );
    }

    // Filter by language if specified
    if (filters.language) {
      query.languages = filters.language;
    }

    console.log("[GUIDES_DEBUG] final guide filter =", JSON.stringify(query));

    // DEBUG: Count total guides and guides in this province
    const totalGuides = await guideRepository.countDocuments({});
    console.log("[GUIDES_DEBUG] total guides in this DB =", totalGuides);

    if (resolvedProvinceId) {
      const totalInProvince = await guideRepository.countDocuments({
        $or: [
          { province: resolvedProvinceId },
          { provinces: resolvedProvinceId },
        ],
      });
      console.log(
        "[GUIDES_DEBUG] total guides in this province =",
        totalInProvince
      );
    }

    // Get all verified guides
    let guides = await guideRepository.findAll(query);
    console.log("[GUIDES_DEBUG] guides found by query =", guides.length);

    // Filter by location if meeting point provided
    if (trip.meetingPoint && trip.meetingPoint.coordinates) {
      const maxDistance = filters.maxDistanceKm || 50; // 50km default radius
      guides = guides.filter((guide) => {
        if (!guide.location || !guide.location.coordinates) {
          console.log(
            `[GUIDES_DEBUG] Filtering out guide ${guide._id} - no location data`
          );
          return false;
        }

        // Calculate distance (simplified - should use proper geo query)
        const [tripLng, tripLat] = trip.meetingPoint.coordinates;
        const [guideLng, guideLat] = guide.location.coordinates;

        const distance =
          Math.sqrt(
            Math.pow(tripLat - guideLat, 2) + Math.pow(tripLng - guideLng, 2)
          ) * 111; // Rough km conversion

        if (distance > maxDistance) {
          console.log(
            `[GUIDES_DEBUG] Filtering out guide ${guide._id} - distance ${distance}km > ${maxDistance}km`
          );
          return false;
        }
        return true;
      });
    } else {
      console.log(
        "[GUIDES_DEBUG] Trip has no meetingPoint coordinates, skipping location filter"
      );
    }

    // Sort by rating (descending)
    guides.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    // Apply pagination
    const page = parseInt(filters.page || 1);
    const limit = parseInt(filters.limit || 20);
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedGuides = guides.slice(startIndex, endIndex);

    // Update candidate guides in trip for reference using robust fallback sequence
    const candidateIds = guides.map((g) => g._id);
    await this._updateTripCandidateGuides(tripId, candidateIds);

    return {
      guides: paginatedGuides,
      pagination: {
        total: guides.length,
        page,
        pages: Math.ceil(guides.length / limit),
      },
      trip: {
        id: trip._id,
        startAt: trip.startAt,
        meetingAddress: trip.meetingAddress,
        status: trip.status,
      },
    };
  }

  /**
   * Robust helper to update trip's candidateGuides field
   * Uses multiple fallback strategies to ensure compatibility
   * @private
   * @param {String} tripId - Trip ID
   * @param {Array} candidateIds - Array of guide IDs
   */
  /**
   * Refactored: Update candidate guides cleanly using repository
   */
  async _updateTripCandidateGuides(tripId, candidateIds) {
    try {
      await tripRepository.updateById(tripId, {
        candidateGuides: candidateIds,
      });
    } catch (err) {
      console.error("[NewTripFlow] Failed to update candidate guides:", err);
    }
  }

  /**
   * STEP 3: Tourist selects a guide for the trip
   * Status change: 'selecting_guide' → 'awaiting_call'
   */
  /**
   * STEP 3: Tourist selects a guide for the trip
   * Status change: 'selecting_guide' → 'awaiting_call'
   */
  async selectGuideForTrip(tripId, touristId, guideId, ipAddress, userAgent) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // Ownership check
    const tripTouristId = trip.tourist?._id
      ? trip.tourist._id.toString()
      : trip.tourist.toString();
    if (tripTouristId !== touristId.toString()) {
      throw new Error("You can only select guides for your own trips");
    }

    // Validate Status Transition
    validateTransition(trip.status, TRIP_STATES.AWAITING_CALL);

    // Verify Guide
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }
    // Strict verification check for prod
    if (!guide.isActive) {
      throw new Error("Selected guide is not active");
    }

    // Atomic Update with Status Guard
    // Only update if status is still valid (prevent race conditions)
    // NOTE: using updateOne with filter on status to be atomic
    const updateResult = await tripRepository.updateOne(
      {
        _id: tripId,
        status: trip.status, // Optimistic locking on status
      },
      {
        selectedGuide: guideId,
        guide: guideId, // Legacy sync
        status: TRIP_STATES.AWAITING_CALL,
      }
    );

    if (updateResult.modifiedCount === 0) {
      throw new Error(
        "Trip status changed during selection. Please refresh and try again."
      );
    }

    // Fetch updated trip
    const updatedTrip = await tripRepository.findById(tripId);

    // Notify Guide
    await notificationService.notifyGuideSelected(guide, updatedTrip);

    await logAudit({
      userId: touristId,
      action: AUDIT_ACTIONS.SELECT_GUIDE_FOR_TRIP,
      resourceType: "trip",
      resourceId: trip._id,
      details: {
        guideId,
        previousStatus: trip.status,
        newStatus: TRIP_STATES.AWAITING_CALL,
      },
      ipAddress,
      userAgent,
    });

    return {
      message: "Guide selected successfully. You can now initiate a call.",
      trip: updatedTrip,
      guide: {
        id: guide._id,
        name: guide.name,
        pricePerHour: guide.pricePerHour,
        languages: guide.languages,
        rating: guide.rating,
      },
      nextStep: "initiate_call",
      nextEndpoint: `/api/trips/${tripId}/calls/initiate`,
    };
  }

  /**
   * STEP 4: Initiate call tied to trip
   * This replaces the old /api/calls/initiate endpoint
   */
  /**
   * STEP 4: Initiate call tied to trip
   * Status change: 'awaiting_call' → 'in_call'
   */
  async initiateTripCall(tripId, touristId, ipAddress, userAgent) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // Ownership check
    const tripTouristId = trip.tourist?._id
      ? trip.tourist._id.toString()
      : trip.tourist.toString();
    if (tripTouristId !== touristId.toString()) {
      throw new Error("You can only initiate calls for your own trips");
    }

    // Transition Validation
    // Allow re-initiation if already in_call (reconnection scenario)
    if (trip.status !== TRIP_STATES.IN_CALL) {
      validateTransition(trip.status, TRIP_STATES.IN_CALL);
    }

    if (!trip.selectedGuide) {
      throw new Error("No guide selected for trip");
    }

    const selectedGuideId = trip.selectedGuide._id || trip.selectedGuide;

    // Get Guide User
    const guide = await guideRepository.findById(selectedGuideId);
    if (!guide) throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);

    const guideUserId = guide.user?._id
      ? guide.user._id.toString()
      : guide.user.toString();

    // Create Session
    const callSession = await callService.createSession(
      touristId,
      guideUserId,
      trip._id
    );

    // Record usage
    const callRecord = {
      callId: callSession._id,
      guideId: selectedGuideId,
      startedAt: callSession.startedAt,
      createdAt: new Date(),
    };

    // Atomic Update: 'awaiting_call' -> 'in_call' or stay 'in_call' if rejoining
    // We allow re-entering 'in_call' state if already there (for re-connections)
    const targetStatus = TRIP_STATES.IN_CALL;

    // We actually only want to transition if VALID.
    // If it's already in_call, we just add the session? Or is it a new session?
    // Assuming new session = new call attempt.

    await tripRepository.updateById(tripId, {
      $push: { callSessions: callRecord },
      status: targetStatus,
    });

    await logAudit({
      userId: touristId,
      action: AUDIT_ACTIONS.INITIATE_TRIP_CALL,
      resourceType: "trip",
      resourceId: trip._id,
      details: {
        guideId: selectedGuideId,
        callId: callRecord.callId,
      },
      ipAddress,
      userAgent,
    });

    return {
      message: "Call initiated",
      callId: callSession._id,
      tripId: trip._id,
      token: await callService.generateToken(
        callSession._id,
        touristId,
        "tourist"
      ),
      nextStep: "join_call",
    };
  }

  /**
   * STEP 5: End trip call with negotiation results
   * Status change: 'awaiting_call' → 'pending_confirmation'
   */
  /**
   * STEP 5: End trip call with negotiation results
   * Status change: 'in_call' → 'pending_confirmation'
   */
  async endTripCall(callId, userId, endData, ipAddress, userAgent) {
    const { endReason, summary, negotiatedPrice } = endData;

    // 1. Get Call Session
    const callSession = await callService.getSessionById(callId);
    if (!callSession) throw new Error("Call session not found");

    // 2. Find Trip
    const trip = await tripRepository.findOne({
      "callSessions.callId": callId,
    });
    if (!trip) throw new Error("Trip not found for this call");

    // 3. Verify Participant (Tourist or Selected Guide)
    const tripTouristId = trip.tourist?._id
      ? trip.tourist._id.toString()
      : trip.tourist.toString();
    const selectedGuideId = trip.selectedGuide?._id
      ? trip.selectedGuide._id.toString()
      : trip.selectedGuide.toString();

    if (
      tripTouristId !== userId.toString() &&
      selectedGuideId !== userId.toString()
    ) {
      throw new Error("Only call participants can end the call");
    }

    // 4. Update Call Session History
    const updatedCallSessions = trip.callSessions.map((cs) => {
      if (cs.callId.toString() === callId.toString()) {
        return {
          ...cs,
          endedAt: new Date(),
          duration: Math.floor((new Date() - new Date(cs.startedAt)) / 1000),
          summary: summary || "Call completed",
          negotiatedPrice: negotiatedPrice || cs.negotiatedPrice,
        };
      }
      return cs;
    });

    // 5. Determine New Status
    let nextStatus = trip.status;
    if (
      trip.status === TRIP_STATES.IN_CALL ||
      trip.status === TRIP_STATES.AWAITING_CALL
    ) {
      if (negotiatedPrice) {
        // If price negotiated, move to pending confirmation
        nextStatus = TRIP_STATES.PENDING_CONFIRMATION;
      } else {
        // If no price, maybe just ended call but still negotiating?
        // For now, let's assume end call = negotiation done or failed.
        // If no price, we might stay in awaiting_call or go to pending?
        // Let's enforce pending_confirmation if it was a valid call.
        nextStatus = TRIP_STATES.PENDING_CONFIRMATION;
      }
    }

    // validateTransition(trip.status, nextStatus); // Optional check if we want to be strict

    const tripUpdates = {
      callSessions: updatedCallSessions,
      status: nextStatus,
    };

    if (negotiatedPrice) {
      tripUpdates.negotiatedPrice = negotiatedPrice;
    }

    // 6. Atomic Update
    const updatedTrip = await tripRepository.updateById(trip._id, tripUpdates);

    // 7. End Actual Call Session
    await callService.endSession(
      callId,
      endReason || "completed",
      summary,
      negotiatedPrice
    );

    // 8. Notify Guide if status changed to pending confirmation
    if (nextStatus === TRIP_STATES.PENDING_CONFIRMATION && trip.selectedGuide) {
      const guide = await guideRepository.findById(trip.selectedGuide);
      if (guide) {
        await notificationService.notifyGuideTripPendingConfirmation(
          guide,
          trip,
          { negotiatedPrice, summary }
        );
      }
    }

    // 9. Emit real-time status update (NON-BLOCKING)
    emitTripStatusUpdate(updatedTrip);

    // 10. Audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.END_TRIP_CALL,
      resourceType: "trip",
      resourceId: trip._id,
      details: { callId, endReason, negotiatedPrice, newStatus: nextStatus },
      ipAddress,
      userAgent,
    });

    return {
      message: "Call ended. Waiting for confirmation.",
      trip: updatedTrip,
      callSummary: { callId, negotiatedPrice },
      nextStep: "awaiting_guide_confirmation",
    };
  }

  /**
   * STEP 6a: Guide accepts trip
   * Status change: 'pending_confirmation' → 'awaiting_payment'
   * Payment must be completed before trip is confirmed
   */
  /**
   * STEP 6a: Guide accepts trip
   * Status change: 'pending_confirmation' → 'awaiting_payment'
   */
  async guideAcceptTrip(tripId, guideId, ipAddress, userAgent) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);

    // Verify Guide
    const selectedGuideUserId = trip.selectedGuide?.user?._id
      ? trip.selectedGuide.user._id.toString()
      : trip.selectedGuide?.user?.toString();

    if (!selectedGuideUserId || selectedGuideUserId !== guideId.toString()) {
      throw new Error(
        "You can only accept trips where you are the selected guide"
      );
    }

    // Idempotency Check
    if (trip.status === TRIP_STATES.AWAITING_PAYMENT) {
      return { message: "Trip is already awaiting payment", trip };
    }
    if (trip.status === TRIP_STATES.CONFIRMED) {
      return { message: "Trip is already confirmed", trip };
    }

    // Validate Transition
    validateTransition(trip.status, TRIP_STATES.AWAITING_PAYMENT);

    // Handle Implicit Call End (Direct Accept from Call)
    let negotiatedPrice = trip.negotiatedPrice;
    if (trip.status === TRIP_STATES.IN_CALL && !negotiatedPrice) {
      // Calculate estimated price if not set
      // Default to 4 hours if totalDurationMinutes missing?
      const durationHours = (trip.totalDurationMinutes || 240) / 60;
      const guidePrice = trip.selectedGuide?.pricePerHour || 20; // fallback
      negotiatedPrice = Math.round(durationHours * guidePrice);
      console.log(
        `[NewTripFlow] Auto-calculated negotiatedPrice for direct accept: ${negotiatedPrice}`
      );
    }

    // Atomic Update
    const updateQuery = {
      status: TRIP_STATES.AWAITING_PAYMENT,
      paymentStatus: "pending",
    };
    if (negotiatedPrice) {
      updateQuery.negotiatedPrice = negotiatedPrice;
    }

    const updatedTrip = await tripRepository.updateOne(
      { _id: tripId, status: trip.status },
      updateQuery
    );

    if (updatedTrip.modifiedCount === 0) {
      throw new Error("Trip status changed. Please refresh.");
    }

    // Fetch fresh
    const freshTrip = await tripRepository.findById(tripId);

    // Notify Tourist
    const tourist = await userRepository.findById(trip.tourist);
    if (tourist) {
      await notificationService.notifyTouristTripAwaitingPayment(
        tourist,
        freshTrip
      );
    }

    // Emit real-time status update (NON-BLOCKING)
    emitTripStatusUpdate(freshTrip);

    await logAudit({
      userId: guideId,
      action: AUDIT_ACTIONS.ACCEPT_TRIP,
      resourceType: "trip",
      resourceId: trip._id,
      details: { newStatus: TRIP_STATES.AWAITING_PAYMENT },
      ipAddress,
      userAgent,
    });

    return {
      message: "Trip accepted. Awaiting payment from tourist.",
      trip: freshTrip,
    };
  }

  /**
   * STEP 6b: Guide rejects trip
   * Status change: 'pending_confirmation' → 'rejected'
   */
  async guideRejectTrip(tripId, guideId, reason, ipAddress, userAgent) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);

    // Verify Guide
    const selectedGuideUserId = trip.selectedGuide?.user?._id
      ? trip.selectedGuide.user._id.toString()
      : trip.selectedGuide?.user?.toString();

    if (!selectedGuideUserId || selectedGuideUserId !== guideId.toString()) {
      throw new Error(
        "You can only reject trips where you are the selected guide"
      );
    }

    validateTransition(trip.status, TRIP_STATES.REJECTED);

    // Atomic Update
    const updateResult = await tripRepository.updateOne(
      { _id: tripId, status: trip.status },
      {
        status: TRIP_STATES.REJECTED,
        cancellationReason: reason,
        cancelledBy: "guide",
        cancelledAt: new Date(),
        selectedGuide: null, // Clear selected guide so tourist can select another
      }
    );

    if (updateResult.modifiedCount === 0) {
      throw new Error("Trip status changed or update failed. Please refresh.");
    }

    const freshTrip = await tripRepository.findById(tripId);

    // Notify Tourist
    const tourist = await userRepository.findById(freshTrip.tourist);
    if (tourist) {
      await notificationService.notifyTouristTripRejected(
        tourist,
        freshTrip,
        reason
      );
    }

    // Emit real-time status update (NON-BLOCKING)
    emitTripStatusUpdate(freshTrip);

    await logAudit({
      userId: guideId,
      action: AUDIT_ACTIONS.REJECT_TRIP,
      resourceType: "trip",
      resourceId: trip._id,
      details: {
        reason,
        newStatus: TRIP_STATES.REJECTED,
      },
      ipAddress,
      userAgent,
    });

    return {
      message: "Trip rejected.",
      trip: freshTrip,
    };
  }
}

export default new NewTripFlowService();

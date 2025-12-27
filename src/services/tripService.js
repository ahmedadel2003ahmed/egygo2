import mongoose from "mongoose";
import tripRepository from "../repositories/tripRepository.js";
import guideRepository from "../repositories/guideRepository.js";
import userRepository from "../repositories/userRepository.js";
import attractionRepository from "../repositories/attractionRepository.js";
import callRepository from "../repositories/callRepository.js";
import notificationService from "./notificationService.js";
import { calculateDistance } from "../utils/haversine.js";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  TRIP_STATUS,
  TRIP_CANCELLATION_WINDOW_HOURS,
  AUDIT_ACTIONS,
} from "../utils/constants.js";
import { logAudit } from "../utils/auditLogger.js";
import { emitTripStatusUpdate } from "../sockets/tripSocketEmitter.js";

// Environment configuration with defaults
const AVERAGE_SPEED_KMH = parseFloat(process.env.AVERAGE_SPEED_KMH || "30");
const SAFETY_BUFFER_MINUTES = parseFloat(
  process.env.SAFETY_BUFFER_MINUTES || "15"
);
const SERVICE_FEE_PERCENT = parseFloat(process.env.SERVICE_FEE_PERCENT || "0");

/**
 * Trip Service - Business logic for trip operations with multi-place itinerary support
 */
class TripService {
  /**
   * Estimate trip preview - calculates duration and timing for multi-place itinerary
   * @param {Object} params - Estimation parameters
   * @param {Array} params.itinerary - Array of { placeId, visitDurationMinutes }
   * @param {Date|String} params.startAt - Trip start time
   * @returns {Promise<Object>} { totalVisitMinutes, travelEstimateMinutes, totalMinutes, endAt }
   *
   * Algorithm:
   * 1. Fetch all place coordinates from database
   * 2. Calculate travel time between consecutive places using Haversine distance
   * 3. Sum all visit durations
   * 4. Add safety buffer for unexpected delays
   * 5. Calculate end time
   */
  async estimatePreview({ itinerary, startAt }) {
    // Validate inputs
    if (!itinerary || itinerary.length === 0) {
      const error = new Error("Itinerary must contain at least one place");
      error.status = 400;
      throw error;
    }

    if (!startAt) {
      const error = new Error("Start time is required");
      error.status = 400;
      throw error;
    }

    const startDate = new Date(startAt);
    if (isNaN(startDate.getTime())) {
      const error = new Error("Invalid start date");
      error.status = 400;
      throw error;
    }

    // Fetch all places to get coordinates
    const placeIds = itinerary.map((item) => item.placeId);
    const places = await Promise.all(
      placeIds.map(async (placeId) => {
        const place = await attractionRepository.findById(placeId);
        if (!place) {
          const error = new Error(`Place not found: ${placeId}`);
          error.status = 404;
          throw error;
        }
        return place;
      })
    );

    // Calculate total visit duration
    const totalVisitMinutes = itinerary.reduce((sum, item) => {
      return sum + (item.visitDurationMinutes || 0);
    }, 0);

    // Calculate travel time between places
    let travelEstimateMinutes = 0;

    if (places.length > 1) {
      for (let i = 0; i < places.length - 1; i++) {
        const place1 = places[i];
        const place2 = places[i + 1];

        // Extract coordinates [longitude, latitude]
        const coords1 = place1.location.coordinates;
        const coords2 = place2.location.coordinates;

        if (!coords1 || !coords2 || coords1.length < 2 || coords2.length < 2) {
          const error = new Error(
            `Invalid coordinates for place ${place1._id} or ${place2._id}`
          );
          error.status = 422;
          throw error;
        }

        // Calculate distance in km using Haversine
        // coordinates are [longitude, latitude], but haversine expects (lat, lon)
        const distanceKm = calculateDistance(
          coords1[1],
          coords1[0], // lat1, lon1
          coords2[1],
          coords2[0] // lat2, lon2
        );

        // Convert to travel time in minutes
        const travelTimeMinutes = (distanceKm / AVERAGE_SPEED_KMH) * 60;

        // Add minimum buffer per leg (at least 5 minutes per transition)
        const legBuffer = Math.max(5, travelTimeMinutes * 0.1);

        travelEstimateMinutes += travelTimeMinutes + legBuffer;
      }
    }

    // Add overall safety buffer
    const totalMinutes = Math.ceil(
      totalVisitMinutes + travelEstimateMinutes + SAFETY_BUFFER_MINUTES
    );

    // Calculate end time
    const endAt = new Date(startDate.getTime() + totalMinutes * 60000);

    return {
      totalVisitMinutes,
      travelEstimateMinutes: Math.ceil(travelEstimateMinutes),
      totalMinutes,
      endAt,
    };
  }

  /**
   * Create a new trip with agreement validation (NEW FLOW)
   *
   * CRITICAL CHANGES:
   * - Guide is now REQUIRED (no cart-like behavior)
   * - CallId OR explicit agreement required
   * - negotiatedPrice is the source of truth
   * - Itinerary is optional (may be verbal agreement)
   *
   * @param {Object} params - Trip creation parameters
   * @param {String} params.touristId - Tourist user ID (required)
   * @param {String} params.guideId - Guide ID (required)
   * @param {Number} params.negotiatedPrice - Agreed price (required)
   * @param {Date|String} params.startAt - Trip start time (required, must be future)
   * @param {Array} params.itinerary - Optional array of { placeId, visitDurationMinutes, notes, ticketRequired }
   * @param {Number} params.totalDurationMinutes - Optional total duration
   * @param {Object} params.meetingPoint - { coordinates: [lng, lat] } (optional)
   * @param {String} params.meetingAddress - Meeting address string (optional)
   * @param {String} params.callId - Call session ID (recommended)
   * @param {Boolean} params.agreedByBoth - Explicit agreement flag if no callId
   * @param {String} params.agreementNote - Agreement explanation if no callId
   * @param {String} params.createdFromPlaceId - Source place ID if created from place details
   * @returns {Promise<Object>} Created trip
   */
  async createTrip({
    touristId,
    guideId,
    negotiatedPrice,
    startAt,
    itinerary = [],
    totalDurationMinutes,
    meetingPoint,
    meetingAddress,
    callId,
    agreedByBoth,
    agreementNote,
    createdFromPlaceId,
  }) {
    // === VALIDATION PHASE ===

    // 1. Validate required fields
    if (!guideId) {
      const error = new Error(
        "Guide is required - trips cannot be created without a guide assignment"
      );
      error.status = 422;
      throw error;
    }

    if (negotiatedPrice === undefined || negotiatedPrice === null) {
      const error = new Error("negotiatedPrice is required");
      error.status = 422;
      throw error;
    }

    if (negotiatedPrice < 0) {
      const error = new Error("negotiatedPrice must be >= 0");
      error.status = 422;
      throw error;
    }

    // 2. Validate agreement proof (callId OR explicit agreement)
    if (!callId && !agreedByBoth) {
      const error = new Error(
        "Trip creation requires proof of agreement. Either provide callId (recommended) or set agreedByBoth=true with agreementNote explaining the verbal/manual agreement."
      );
      error.status = 422;
      error.code = "AGREEMENT_REQUIRED";
      throw error;
    }

    if (!callId && agreedByBoth && !agreementNote) {
      const error = new Error(
        "agreementNote is required when creating trip without callId"
      );
      error.status = 422;
      throw error;
    }

    // 3. Validate startAt is in the future
    const startDate = new Date(startAt);
    if (isNaN(startDate.getTime())) {
      const error = new Error("Invalid startAt date");
      error.status = 400;
      throw error;
    }

    if (startDate <= new Date()) {
      const error = new Error("startAt must be in the future");
      error.status = 422;
      throw error;
    }

    // 4. Check for duplicate trips (deduplication)
    if (callId) {
      const existingTrip = await tripRepository.findDuplicate(
        callId,
        touristId,
        startAt
      );
      if (existingTrip) {
        const error = new Error(
          "A trip with this callId and time already exists"
        );
        error.status = 409;
        error.existingTripId = existingTrip._id;
        throw error;
      }
    }

    // === ENTITY VALIDATION ===

    // 5. Validate guide exists
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      const error = new Error(
        ERROR_MESSAGES.GUIDE_NOT_FOUND || "Guide not found"
      );
      error.status = 404;
      throw error;
    }

    // 6. Validate tourist exists
    const tourist = await userRepository.findById(touristId);
    if (!tourist) {
      const error = new Error("Tourist user not found");
      error.status = 404;
      throw error;
    }

    // 7. If callId provided, validate call exists and was successful
    let callSession = null;
    if (callId) {
      callSession = await callRepository.findById(callId);
      if (!callSession) {
        const error = new Error("CallSession not found");
        error.status = 404;
        throw error;
      }

      // Verify tourist and guide match the call participants
      if (
        callSession.touristUser.toString() !== touristId.toString() ||
        callSession.guideUser.toString() !== guide.user._id.toString()
      ) {
        const error = new Error(
          "Tourist and guide must match the call participants"
        );
        error.status = 422;
        throw error;
      }

      // Verify call ended successfully
      if (callSession.status !== "ended") {
        const error = new Error("Call must be ended before creating trip");
        error.status = 422;
        throw error;
      }
    }

    // === CALCULATE DURATION AND END TIME ===

    let estimates = null;
    let calculatedEndAt = null;

    if (itinerary && itinerary.length > 0) {
      // Validate itinerary items
      itinerary.forEach((item, index) => {
        if (!item.placeId) {
          const error = new Error(
            `Itinerary item ${index}: placeId is required`
          );
          error.status = 400;
          throw error;
        }
        if (!item.visitDurationMinutes || item.visitDurationMinutes < 1) {
          const error = new Error(
            `Itinerary item ${index}: visitDurationMinutes must be at least 1`
          );
          error.status = 400;
          throw error;
        }
      });

      // Get time estimates
      estimates = await this.estimatePreview({ itinerary, startAt });
      calculatedEndAt = estimates.endAt;

      // Use provided totalDurationMinutes if given, otherwise use estimate
      if (!totalDurationMinutes) {
        totalDurationMinutes = estimates.totalMinutes;
      }
    } else if (totalDurationMinutes) {
      // Calculate endAt from totalDurationMinutes
      calculatedEndAt = new Date(
        startDate.getTime() + totalDurationMinutes * 60000
      );
    }

    // === CHECK GUIDE AVAILABILITY ===

    if (calculatedEndAt) {
      const overlappingTrips = await tripRepository.findOverlappingTrips(
        guideId,
        startDate,
        calculatedEndAt,
        ["confirmed", "in_progress"]
      );

      if (overlappingTrips.length > 0) {
        const error = new Error(
          ERROR_MESSAGES.GUIDE_NOT_AVAILABLE ||
            "Guide is not available for this time slot"
        );
        error.status = 409;
        error.conflictingTrips = overlappingTrips.map((t) => t._id);
        throw error;
      }
    }

    // === PREPARE PRICE BREAKDOWN ===

    let guideFee = 0;
    let tickets = 0;

    // Calculate guide fee if duration known
    if (totalDurationMinutes) {
      guideFee = guide.pricePerHour * (totalDurationMinutes / 60);
    }

    // Calculate ticket costs from itinerary
    if (itinerary && itinerary.length > 0) {
      for (const item of itinerary) {
        if (item.ticketRequired) {
          const place = await attractionRepository.findById(item.placeId);
          if (place && place.ticketPrice) {
            tickets += place.ticketPrice;
          }
        }
      }
    }

    // Calculate service fee
    const serviceFee = (guideFee + tickets) * (SERVICE_FEE_PERCENT / 100);

    // Prepare price breakdown
    const priceBreakdown = {
      guideFee: Math.round(guideFee * 100) / 100,
      tickets: Math.round(tickets * 100) / 100,
      serviceFee: Math.round(serviceFee * 100) / 100,
      total: Math.round(negotiatedPrice * 100) / 100, // Use negotiatedPrice as total
    };

    // === PREPARE TRIP DATA ===

    // Prepare meeting point data
    let meetingPointData = null;
    if (
      meetingPoint &&
      meetingPoint.coordinates &&
      meetingPoint.coordinates.length === 2
    ) {
      meetingPointData = {
        type: "Point",
        coordinates: meetingPoint.coordinates,
      };
    }

    // Format itinerary for database
    const formattedItinerary =
      itinerary && itinerary.length > 0
        ? itinerary.map((item) => ({
            place: item.placeId,
            visitDurationMinutes: item.visitDurationMinutes,
            notes: item.notes || undefined,
            ticketRequired: item.ticketRequired || false,
          }))
        : [];

    // Determine agreement source
    const agreementSource = callId ? "call" : "manual";

    // Create trip document
    const tripData = {
      tourist: touristId,
      guide: guideId,
      itinerary: formattedItinerary,
      callId: callId || undefined,
      negotiatedPrice,
      startAt: startDate,
      totalDurationMinutes: totalDurationMinutes || undefined,
      endAt: calculatedEndAt || undefined,
      meetingPoint: meetingPointData,
      meetingAddress: meetingAddress || undefined,
      price: negotiatedPrice, // For backward compatibility
      priceBreakdown,
      paymentStatus: "unpaid",
      status: "pending",
      meta: {
        createdFromPlaceId: createdFromPlaceId || undefined,
        agreementSource,
        agreementNote: agreementNote || undefined,
      },
    };

    const trip = await tripRepository.create(tripData);

    // === POST-CREATION ACTIONS ===

    // Notify guide about new trip request
    notificationService
      .notifyGuideNewTrip(guide, trip, tourist)
      .catch((err) => {
        console.error("Failed to send trip notification:", err);
      });

    // Log audit
    await logAudit({
      userId: touristId,
      action: AUDIT_ACTIONS.CREATE_TRIP || "create_trip",
      resourceType: "trip",
      resourceId: trip._id,
      details: {
        guideId,
        negotiatedPrice,
        agreementSource,
        callId: callId || null,
      },
    });

    return trip;
  }

  /**
   * Prepare trip payload from a completed call session
   * Helper method that suggests trip parameters based on call
   * Does NOT create the trip - returns suggested payload
   *
   * @param {String} callId - Call session ID
   * @param {String} touristId - Tourist user ID (for verification)
   * @returns {Promise<Object>} Suggested trip payload
   */
  async prepareTripFromCall(callId, touristId) {
    // Validate call exists
    const callSession = await callRepository.findById(callId);
    if (!callSession) {
      const error = new Error("CallSession not found");
      error.status = 404;
      throw error;
    }

    // Verify tourist is participant
    if (callSession.touristUser.toString() !== touristId.toString()) {
      const error = new Error("You are not a participant in this call");
      error.status = 403;
      throw error;
    }

    // Verify call ended
    if (callSession.status !== "ended") {
      const error = new Error("Call must be ended before converting to trip");
      error.status = 422;
      throw error;
    }

    // Verify both participants were present
    if (!callSession.endReason || callSession.endReason === "error") {
      const error = new Error("Call did not complete successfully");
      error.status = 422;
      throw error;
    }

    // Get guide details
    const guide = await guideRepository.findByUserId(
      callSession.guideUser.toString()
    );
    if (!guide) {
      const error = new Error("Guide not found for this call");
      error.status = 404;
      throw error;
    }

    // Suggest trip parameters
    const suggestedPayload = {
      guideId: guide._id.toString(),
      callId: callId,
      touristId: touristId,
      // Suggest startAt as tomorrow at 9 AM
      suggestedStartAt: (() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.toISOString();
      })(),
      // Suggest 4 hours duration
      suggestedTotalDurationMinutes: 240,
      // Calculate suggested price (4 hours)
      suggestedNegotiatedPrice: Math.round(guide.pricePerHour * 4 * 100) / 100,
      guidePricePerHour: guide.pricePerHour,
      guideInfo: {
        name: guide.name,
        languages: guide.languages,
        rating: guide.rating,
      },
    };

    return suggestedPayload;
  }

  /**
   * DEPRECATED: Legacy createTrip method for backward compatibility
   * This method is kept for existing integrations but will be removed in future versions
   * 
   * @deprecated Use createTrip with callId or agreement validation instead
```</output>

   * Converts old single-place trip format to new itinerary format
   */
  async createTripLegacy(touristId, tripData, ipAddress, userAgent) {
    const { guideId, startAt, durationHours, meetingPoint, notes } = tripData;

    // Validate guide exists
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    // Convert startAt to Date if it's a string
    const startDate = new Date(startAt);

    // Check guide availability
    const isAvailable = await tripRepository.checkGuideAvailability(
      guideId,
      startDate,
      durationHours
    );

    if (!isAvailable) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_AVAILABLE);
    }

    // Calculate total price
    const totalPrice = guide.pricePerHour * durationHours;

    // Prepare meeting point
    let meetingPointData = {
      address: meetingPoint.address,
    };

    if (meetingPoint.coordinates && meetingPoint.coordinates.length === 2) {
      meetingPointData.type = "Point";
      meetingPointData.coordinates = meetingPoint.coordinates;
    }

    // Create trip
    const trip = await tripRepository.create({
      tourist: touristId,
      guide: guideId,
      startAt: startDate,
      durationHours,
      meetingPoint: meetingPointData,
      notes,
      totalPrice,
      status: TRIP_STATUS.PENDING,
    });

    // Log audit
    await logAudit({
      userId: touristId,
      action: "create_trip",
      resourceType: "trip",
      resourceId: trip._id,
      details: { guideId, startAt, durationHours, totalPrice },
      ipAddress,
      userAgent,
    });

    // Notify guide
    const tourist = await userRepository.findById(touristId);
    await notificationService.notifyGuideNewTripRequest(guide, trip, tourist);

    return {
      message: SUCCESS_MESSAGES.TRIP_CREATED,
      trip,
    };
  }

  /**
   * Get trip by ID
   */
  async getTripById(tripId) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    return trip;
  }

  /**
   * Get trips for tourist
   */
  async getTouristTrips(touristId, options) {
    return await tripRepository.findByTourist(touristId, options);
  }

  /**
   * Get trips for guide
   */
  async getGuideTrips(guideId, options) {
    return await tripRepository.findByGuide(guideId, options);
  }

  /**
   * Check guide availability for a time window
   * @param {String} guideId - Guide ID
   * @param {Date} startAt - Trip start time
   * @param {Date} endAt - Trip end time
   * @returns {Promise<Object>} { available: Boolean, conflictingTrips: Array }
   */
  async checkGuideAvailability(guideId, startAt, endAt) {
    const overlappingTrips = await tripRepository.findOverlappingTrips(
      guideId,
      startAt,
      endAt,
      ["confirmed", "in_progress"]
    );

    return {
      available: overlappingTrips.length === 0,
      conflictingTrips: overlappingTrips,
    };
  }

  /**
   * Guide accepts trip with atomic conflict detection
   * Uses findOneAndUpdate to ensure atomic status change and prevent race conditions
   * @param {String} guideId - Guide ID
   * @param {String} tripId - Trip ID
   * @param {String} ipAddress - Request IP
   * @param {String} userAgent - Request user agent
   * @returns {Promise<Object>} { success, trip, message }
   */
  async acceptTrip(guideId, tripId, ipAddress, userAgent) {
    console.log(
      `[CALL_DEBUG] acceptTrip called. guideId: ${guideId}, tripId: ${tripId}`
    );

    if (!mongoose.Types.ObjectId.isValid(tripId)) {
      const error = new Error("Invalid tripId");
      error.status = 400;
      throw error;
    }

    try {
      // 1. Load Trip
      const trip = await tripRepository.findById(tripId);
      if (!trip) {
        console.log(`[CALL_DEBUG] Trip not found: ${tripId}`);
        const error = new Error(
          ERROR_MESSAGES.TRIP_NOT_FOUND || "Trip not found"
        );
        error.status = 404;
        throw error;
      }

      console.log(`[CALL_DEBUG] Trip loaded: ${trip._id}`);
      console.log(`[CALL_DEBUG] trip.selectedGuide:`, trip.selectedGuide);
      console.log(`[CALL_DEBUG] trip.guide:`, trip.guide);

      // 2. Resolve Target Guide ID
      let resolvedGuideId = null;

      // Handle selectedGuide (could be ObjectId, object with _id, or string)
      if (trip.selectedGuide) {
        if (trip.selectedGuide._id) {
          resolvedGuideId = trip.selectedGuide._id.toString();
        } else {
          resolvedGuideId = trip.selectedGuide.toString();
        }
      }
      // Fallback to guide field
      else if (trip.guide) {
        if (trip.guide._id) {
          resolvedGuideId = trip.guide._id.toString();
        } else {
          resolvedGuideId = trip.guide.toString();
        }
      }

      console.log(`[CALL_DEBUG] Resolved target guide ID: ${resolvedGuideId}`);

      if (!resolvedGuideId) {
        console.log(`[CALL_DEBUG] No guide selected for this trip`);
        const error = new Error("No guide selected for this trip");
        error.status = 422;
        throw error;
      }

      // 3. Verify Authorization
      // The guideId passed to this method comes from the authenticated user's guide profile
      if (resolvedGuideId !== guideId.toString()) {
        console.log(
          `[CALL_DEBUG] Authorization failed. Requesting guide: ${guideId}, Target guide: ${resolvedGuideId}`
        );
        const error = new Error(
          ERROR_MESSAGES.FORBIDDEN ||
            "You are not authorized to accept this trip"
        );
        error.status = 403;
        throw error;
      }

      // 4. Check Availability
      const startAtDate = new Date(trip.startAt);
      // Default to 4 hours if endAt is missing
      const tripEndAt = trip.endAt
        ? new Date(trip.endAt)
        : new Date(startAtDate.getTime() + 4 * 60 * 60 * 1000);

      const availability = await this.checkGuideAvailability(
        guideId,
        startAtDate,
        tripEndAt
      );

      if (!availability.available) {
        console.log(
          `[CALL_DEBUG] Guide has conflicting trip: ${availability.conflictingTrips[0]._id}`
        );
        const error = new Error("Guide has a conflicting trip");
        error.status = 409;
        error.conflictingTripId = availability.conflictingTrips[0]._id;
        throw error;
      }

      // 5. Atomic Update
      const updatePayload = {
        status: "confirmed",
        confirmedAt: new Date(),
        guide: resolvedGuideId, // Ensure guide is assigned
        selectedGuide: resolvedGuideId,
      };

      console.log("[CALL_DEBUG] Updating trip with payload:", updatePayload);

      const Trip = (await import("../models/Trip.js")).default;
      const updatedTrip = await Trip.findOneAndUpdate(
        {
          _id: tripId,
          // We allow accepting if it's pending OR pending_confirmation (new flow)
          status: { $in: ["pending", "pending_confirmation"] },
        },
        { $set: updatePayload },
        {
          new: true,
          runValidators: true,
        }
      )
        .populate("tourist", "name email phone avatar")
        .populate({
          path: "guide",
          populate: { path: "user", select: "name email phone avatar" },
        })
        .populate("itinerary.place", "name location ticketPrice");

      if (!updatedTrip) {
        console.log(
          `[CALL_DEBUG] Update failed. Trip status might have changed.`
        );
        const error = new Error(
          "Trip status has changed. It may have already been accepted or cancelled."
        );
        error.status = 409;
        throw error;
      }

      console.log(
        `[CALL_DEBUG] Trip accepted successfully: ${updatedTrip._id}, status: ${updatedTrip.status}`
      );

      // 6. Audit Log
      const guide = await guideRepository.findById(guideId);
      const guideUserId = guide?.user?._id || guide?.user;

      if (guideUserId) {
        await logAudit({
          userId: guideUserId,
          action: AUDIT_ACTIONS.ACCEPT_TRIP,
          resourceType: "trip",
          resourceId: tripId,
          ipAddress,
          userAgent,
        });
      }

      // 7. Emit real-time status update (NON-BLOCKING)
      emitTripStatusUpdate(updatedTrip);

      // 8. Notification
      notificationService.notifyTouristTripAccepted(tripId).catch((err) => {
        console.error("[CALL_DEBUG] Failed to send notification:", err);
      });

      return {
        success: true,
        message: "Trip accepted successfully",
        trip: updatedTrip,
      };
    } catch (error) {
      console.error("[CALL_DEBUG] acceptTrip error:", error);
      throw error;
    }
  }

  /**
   * Guide rejects trip
   */
  async rejectTrip(guideId, tripId, ipAddress, userAgent) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // Verify guide owns this trip
    if (trip.guide._id.toString() !== guideId.toString()) {
      throw new Error(ERROR_MESSAGES.FORBIDDEN);
    }

    // Check if trip is still pending
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new Error("Trip is not in pending status");
    }

    // Update trip status
    const updatedTrip = await tripRepository.updateById(tripId, {
      status: TRIP_STATUS.CANCELLED,
      cancellationReason: "Rejected by guide",
      cancelledBy: "guide",
      cancelledAt: new Date(),
    });

    // Get guide user ID for audit log
    const guide = await guideRepository.findById(guideId);
    const guideUserId = guide.user._id || guide.user;

    // Log audit
    await logAudit({
      userId: guideUserId,
      action: AUDIT_ACTIONS.REJECT_TRIP,
      resourceType: "trip",
      resourceId: tripId,
      ipAddress,
      userAgent,
    });

    // Emit real-time status update (NON-BLOCKING)
    emitTripStatusUpdate(updatedTrip);

    // Notify tourist
    await notificationService.notifyTouristTripStatusChange(
      trip.tourist,
      updatedTrip,
      TRIP_STATUS.CANCELLED
    );

    return {
      message: "Trip rejected",
      trip: updatedTrip,
    };
  }

  /**
   * Cancel trip (tourist or guide)
   */
  async cancelTrip(userId, tripId, reason, userType, ipAddress, userAgent) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // Verify ownership
    if (userType === "tourist") {
      if (trip.tourist._id.toString() !== userId.toString()) {
        throw new Error(ERROR_MESSAGES.FORBIDDEN);
      }
    } else if (userType === "guide") {
      if (trip.guide._id.toString() !== userId.toString()) {
        throw new Error(ERROR_MESSAGES.FORBIDDEN);
      }
    }

    // Check if trip can be cancelled
    if (
      trip.status === TRIP_STATUS.COMPLETED ||
      trip.status === TRIP_STATUS.CANCELLED
    ) {
      throw new Error("Trip cannot be cancelled");
    }

    // Check cancellation window
    const now = new Date();
    const tripStart = new Date(trip.startAt);
    const hoursUntilTrip = (tripStart - now) / (1000 * 60 * 60);

    if (hoursUntilTrip < TRIP_CANCELLATION_WINDOW_HOURS) {
      throw new Error(
        `Trip can only be cancelled at least ${TRIP_CANCELLATION_WINDOW_HOURS} hours in advance`
      );
    }

    // Update trip
    const updatedTrip = await tripRepository.updateById(tripId, {
      status: TRIP_STATUS.CANCELLED,
      cancellationReason: reason,
      cancelledBy: userType,
      cancelledAt: new Date(),
    });

    // Emit real-time status update (NON-BLOCKING)
    emitTripStatusUpdate(updatedTrip);

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.CANCEL_TRIP,
      resourceType: "trip",
      resourceId: tripId,
      details: { reason, cancelledBy: userType },
      ipAddress,
      userAgent,
    });

    return {
      message: SUCCESS_MESSAGES.TRIP_CANCELLED,
      trip: updatedTrip,
    };
  }

  /**
   * Update trip status (for in-progress, completed, etc.)
   */
  async updateTripStatus(tripId, status) {
    const trip = await tripRepository.updateById(tripId, { status });
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // Emit real-time status update (NON-BLOCKING)
    emitTripStatusUpdate(trip);

    return trip;
  }

  /**
   * Mark trip as completed
   */
  async completeTrip(guideId, tripId, ipAddress, userAgent) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // Verify guide owns this trip
    if (trip.guide._id.toString() !== guideId.toString()) {
      throw new Error(ERROR_MESSAGES.FORBIDDEN);
    }

    // Update trip status
    const updatedTrip = await tripRepository.updateById(tripId, {
      status: TRIP_STATUS.COMPLETED,
    });

    // Emit real-time status update (NON-BLOCKING)
    emitTripStatusUpdate(updatedTrip);

    // Increment guide's total trips
    await guideRepository.incrementTotalTrips(guideId);

    // Get guide user ID for audit log
    const guide = await guideRepository.findById(guideId);
    const guideUserId = guide.user._id || guide.user;

    // Log audit
    await logAudit({
      userId: guideUserId,
      action: "complete_trip",
      resourceType: "trip",
      resourceId: tripId,
      ipAddress,
      userAgent,
    });

    return {
      message: "Trip completed",
      trip: updatedTrip,
    };
  }

  /**
   * Review a completed trip (tourist only)
   */
  async reviewTrip(touristId, tripId, reviewData, ipAddress, userAgent) {
    const { rating, comment } = reviewData;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5 stars");
    }

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(ERROR_MESSAGES.TRIP_NOT_FOUND);
    }

    // Verify tourist owns this trip
    if (trip.tourist._id.toString() !== touristId.toString()) {
      throw new Error(ERROR_MESSAGES.FORBIDDEN);
    }

    // Verify trip is completed
    if (trip.status !== TRIP_STATUS.COMPLETED) {
      throw new Error("Trip must be completed before reviewing");
    }

    // Check if already reviewed
    if (trip.review && trip.review.rating) {
      throw new Error("Trip has already been reviewed");
    }

    // Update trip with review
    const updatedTrip = await tripRepository.updateById(tripId, {
      review: {
        rating,
        comment: comment || null,
        reviewedAt: new Date(),
      },
    });

    // Update guide's average rating
    await this.updateGuideRating(trip.guide._id || trip.guide);

    // Log audit
    await logAudit({
      userId: touristId,
      action: "review_trip",
      resourceType: "trip",
      resourceId: tripId,
      ipAddress,
      userAgent,
      details: { rating },
    });

    return {
      message: "Review submitted successfully",
      trip: updatedTrip,
    };
  }

  /**
   * Update guide's average rating based on all reviews
   */
  async updateGuideRating(guideId) {
    // Get all completed trips with reviews for this guide
    const trips = await tripRepository.findCompletedTripsWithReviews(guideId);

    if (trips.length === 0) {
      return;
    }

    // Calculate average rating
    const totalRating = trips.reduce(
      (sum, trip) => sum + (trip.review.rating || 0),
      0
    );
    const averageRating = totalRating / trips.length;

    // Update guide rating
    await guideRepository.findByIdAndUpdate(guideId, {
      rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
    });
  }

  /**
   * Guide proposes changes to trip itinerary or start time
   * @param {String} guideId - Guide ID
   * @param {String} tripId - Trip ID
   * @param {Object} proposalData - { proposedItinerary, proposedStartAt, note }
   * @returns {Promise<Object>} Updated trip with proposal
   */
  async proposeChange(guideId, tripId, proposalData) {
    const { proposedItinerary, proposedStartAt, note } = proposalData;

    // Validate at least one change is proposed
    if (!proposedItinerary && !proposedStartAt) {
      const error = new Error(
        "Must propose changes to itinerary or start time"
      );
      error.status = 400;
      throw error;
    }

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      const error = new Error(
        ERROR_MESSAGES.TRIP_NOT_FOUND || "Trip not found"
      );
      error.status = 404;
      throw error;
    }

    // Verify guide owns this trip
    if (!trip.guide || trip.guide._id.toString() !== guideId.toString()) {
      const error = new Error(
        ERROR_MESSAGES.FORBIDDEN ||
          "You are not authorized to propose changes to this trip"
      );
      error.status = 403;
      throw error;
    }

    // Cannot propose changes to completed or cancelled trips
    if (["completed", "cancelled"].includes(trip.status)) {
      const error = new Error(
        "Cannot propose changes to completed or cancelled trips"
      );
      error.status = 400;
      throw error;
    }

    // Save current state to history if there's an existing proposal
    if (trip.proposal) {
      if (!trip.proposalHistory) {
        trip.proposalHistory = [];
      }
      trip.proposalHistory.push({
        ...trip.proposal,
        action: "proposed",
        actionBy: trip.proposal.proposer,
        createdAt: trip.proposal.createdAt,
      });
    }

    // Create new proposal
    const proposal = {
      proposer: "guide",
      proposedItinerary: proposedItinerary || trip.itinerary,
      proposedStartAt: proposedStartAt || trip.startAt,
      note: note || "",
      createdAt: new Date(),
    };

    // Update trip
    const updatedTrip = await tripRepository.updateById(tripId, {
      status: "proposal",
      proposal,
      proposalHistory: trip.proposalHistory,
    });

    // Notify tourist asynchronously
    const touristId = trip.tourist._id || trip.tourist;
    notificationService
      .notifyTouristProposal(tripId, touristId)
      .catch((err) => {
        console.error("Failed to send proposal notification to tourist:", err);
      });

    return {
      success: true,
      message: "Proposal submitted successfully",
      trip: updatedTrip,
    };
  }

  /**
   * Tourist accepts guide's proposal - recalculates pricing and updates trip
   * @param {String} touristId - Tourist user ID
   * @param {String} tripId - Trip ID
   * @returns {Promise<Object>} Updated trip
   */
  async acceptProposal(touristId, tripId) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      const error = new Error(
        ERROR_MESSAGES.TRIP_NOT_FOUND || "Trip not found"
      );
      error.status = 404;
      throw error;
    }

    // Verify tourist owns this trip
    if (trip.tourist._id.toString() !== touristId.toString()) {
      const error = new Error(ERROR_MESSAGES.FORBIDDEN || "Access denied");
      error.status = 403;
      throw error;
    }

    // Verify trip is in proposal status
    if (trip.status !== "proposal" || !trip.proposal) {
      const error = new Error("No active proposal to accept");
      error.status = 400;
      throw error;
    }

    const { proposedItinerary, proposedStartAt } = trip.proposal;

    // Re-estimate with proposed changes
    const estimates = await this.estimatePreview({
      itinerary: proposedItinerary,
      startAt: proposedStartAt,
    });

    // Check guide availability for new time slot
    if (trip.guide) {
      const availability = await this.checkGuideAvailability(
        trip.guide._id || trip.guide,
        new Date(proposedStartAt),
        estimates.endAt
      );

      if (!availability.available) {
        const error = new Error(
          "Guide is not available for the proposed time slot"
        );
        error.status = 409;
        error.conflictingTripId = availability.conflictingTrips[0]._id;
        throw error;
      }
    }

    // Recalculate pricing
    let guideFee = 0;
    let tickets = 0;

    if (trip.guide) {
      const guide = await guideRepository.findById(
        trip.guide._id || trip.guide
      );
      guideFee = guide.pricePerHour * (estimates.totalMinutes / 60);
    }

    // Calculate ticket costs for proposed itinerary
    for (const item of proposedItinerary) {
      if (item.ticketRequired) {
        const place = await attractionRepository.findById(
          item.place || item.placeId
        );
        if (place && place.ticketPrice) {
          tickets += place.ticketPrice;
        }
      }
    }

    const serviceFee = (guideFee + tickets) * (SERVICE_FEE_PERCENT / 100);
    const totalPrice = guideFee + tickets + serviceFee;

    const priceBreakdown = {
      guideFee: Math.round(guideFee * 100) / 100,
      tickets: Math.round(tickets * 100) / 100,
      serviceFee: Math.round(serviceFee * 100) / 100,
      total: Math.round(totalPrice * 100) / 100,
    };

    // Format itinerary
    const formattedItinerary = proposedItinerary.map((item) => ({
      place: item.place || item.placeId,
      visitDurationMinutes: item.visitDurationMinutes,
      notes: item.notes || undefined,
      ticketRequired: item.ticketRequired || false,
    }));

    // Add to history
    if (!trip.proposalHistory) {
      trip.proposalHistory = [];
    }
    trip.proposalHistory.push({
      ...trip.proposal,
      action: "accepted",
      actionBy: "tourist",
      createdAt: new Date(),
    });

    // Update trip with accepted proposal
    const updatedTrip = await tripRepository.updateById(tripId, {
      itinerary: formattedItinerary,
      startAt: new Date(proposedStartAt),
      totalDurationMinutes: estimates.totalMinutes,
      endAt: estimates.endAt,
      price: priceBreakdown.total,
      priceBreakdown,
      status: "pending", // Back to pending after acceptance
      proposal: null, // Clear proposal
      proposalHistory: trip.proposalHistory,
    });

    // Notify guide asynchronously
    const guideId = trip.guide._id || trip.guide;
    notificationService
      .notifyGuideProposalAccepted(tripId, guideId)
      .catch((err) => {
        console.error(
          "Failed to send proposal acceptance notification to guide:",
          err
        );
      });

    return {
      success: true,
      message:
        "Proposal accepted successfully. Trip updated with new itinerary and pricing.",
      trip: updatedTrip,
    };
  }

  /**
   * Tourist rejects guide's proposal
   * @param {String} touristId - Tourist user ID
   * @param {String} tripId - Trip ID
   * @param {String} rejectionNote - Optional note explaining rejection
   * @returns {Promise<Object>} Updated trip
   */
  async rejectProposal(touristId, tripId, rejectionNote) {
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      const error = new Error(
        ERROR_MESSAGES.TRIP_NOT_FOUND || "Trip not found"
      );
      error.status = 404;
      throw error;
    }

    // Verify tourist owns this trip
    if (trip.tourist._id.toString() !== touristId.toString()) {
      const error = new Error(ERROR_MESSAGES.FORBIDDEN || "Access denied");
      error.status = 403;
      throw error;
    }

    // Verify trip is in proposal status
    if (trip.status !== "proposal" || !trip.proposal) {
      const error = new Error("No active proposal to reject");
      error.status = 400;
      throw error;
    }

    // Add to history
    if (!trip.proposalHistory) {
      trip.proposalHistory = [];
    }
    trip.proposalHistory.push({
      ...trip.proposal,
      action: "rejected",
      actionBy: "tourist",
      rejectionNote: rejectionNote || "",
      createdAt: new Date(),
    });

    // Update trip - clear proposal and revert to pending
    const updatedTrip = await tripRepository.updateById(tripId, {
      status: "pending",
      proposal: null,
      proposalHistory: trip.proposalHistory,
    });

    // Notify guide asynchronously
    const guideId = trip.guide._id || trip.guide;
    notificationService
      .notifyGuideProposalRejected(tripId, guideId)
      .catch((err) => {
        console.error(
          "Failed to send proposal rejection notification to guide:",
          err
        );
      });

    return {
      success: true,
      message: "Proposal rejected. Trip reverted to original itinerary.",
      trip: updatedTrip,
    };
  }
}

export default new TripService();

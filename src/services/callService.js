import { randomUUID } from "crypto";
import mongoose from "mongoose";
import callRepository from "../repositories/callRepository.js";
import tripRepository from "../repositories/tripRepository.js";
import guideRepository from "../repositories/guideRepository.js";
import notificationService from "./notificationService.js";
import { buildRtcToken, getAgoraAppId } from "../utils/agoraTokenBuilder.js";
import { ERROR_MESSAGES } from "../utils/constants.js";

const CALL_MAX_DURATION_SECONDS = parseInt(
  process.env.CALL_MAX_DURATION_SECONDS || "300"
);
const AGORA_TOKEN_EXPIRY_MARGIN = parseInt(
  process.env.AGORA_TOKEN_EXPIRY_MARGIN || "60"
);

// Store timeout references to auto-end sessions
const sessionTimeouts = new Map();

class CallService {
  /**
   * Create new call session
   * @param {String} touristUserId - Tourist user ID
   * @param {String} guideUserId - Guide user ID
   * @param {String} tripId - Optional trip ID to link call
   * @returns {Promise<Object>} Created call session
   */
  async createSession(touristUserId, guideUserId, tripId = null) {
    console.log("=== CREATE CALL SESSION ===");
    console.log("Input parameters:", { touristUserId, guideUserId, tripId });

    // Validate input IDs
    if (!mongoose.Types.ObjectId.isValid(touristUserId)) {
      const error = new Error("Invalid tourist user ID");
      error.status = 400;
      throw error;
    }

    if (!mongoose.Types.ObjectId.isValid(guideUserId)) {
      const error = new Error("Invalid guide user ID");
      error.status = 400;
      throw error;
    }

    if (tripId && !mongoose.Types.ObjectId.isValid(tripId)) {
      const error = new Error("Invalid trip ID");
      error.status = 400;
      throw error;
    }

    // Verify guide exists
    const guide = await guideRepository.findByUserId(guideUserId);
    if (!guide) {
      const error = new Error(
        ERROR_MESSAGES.GUIDE_NOT_FOUND || "Guide not found"
      );
      error.status = 404;
      throw error;
    }

    console.log("Guide found:", { guideId: guide._id, userId: guide.user });

    // Generate unique channel name
    const channelName = `call_${randomUUID()}`;

    // Generate random UIDs for Agora (must be positive integers)
    const touristUid = Math.floor(Math.random() * 1000000) + 1;
    const guideUid = Math.floor(Math.random() * 1000000) + 1000000; // Offset to avoid collision

    // Create call session
    const sessionData = {
      channelName,
      touristUser: touristUserId,
      guideUser: guideUserId,
      touristUid,
      guideUid,
      status: "ringing",
      maxDurationSeconds: CALL_MAX_DURATION_SECONDS,
      tripId: tripId || undefined,
    };

    console.log("Creating call session with data:", sessionData);

    try {
      const session = await callRepository.createCallSession(sessionData);
      console.log("Call session created successfully:", session._id);

      // Update trip metadata if tripId provided
      if (tripId) {
        try {
          await tripRepository.updateById(tripId, {
            "meta.callId": session._id,
          });
        } catch (error) {
          console.error("Failed to update trip with callId:", error);
          // Non-blocking - call session still created
        }
      }

      // Schedule auto-end timeout
      this.scheduleAutoEnd(session._id, CALL_MAX_DURATION_SECONDS);

      // Notify guide about incoming call (non-blocking)
      notificationService
        .notifyGuideCall(guideUserId, touristUserId, session._id)
        .catch((err) =>
          console.error("Failed to notify guide about call:", err)
        );

      return session;
    } catch (error) {
      console.error("Error creating call session:", error);
      console.error("Validation errors:", error.errors);
      throw error;
    }
  }

  /**
   * Join call session - auto-detect role and generate token
   * @param {String} callId - Call session ID
   * @param {String} userId - User ID requesting to join
   * @returns {Promise<Object>} Join data with token
   */
  async joinCall(callId, userId) {
    const session = await callRepository.findById(callId);

    if (!session) {
      const error = new Error("Call session not found");
      error.status = 404;
      throw error;
    }

    // Debug logging
    console.log("joinCall session:", {
      callId: session._id,
      touristUser: session.touristUser,
      guideUser: session.guideUser,
      touristUid: session.touristUid,
      guideUid: session.guideUid,
    });

    const userIdStr = userId.toString();

    const rawTourist = session.touristUser;
    const rawGuide = session.guideUser;

    // Normalize touristId and guideId safely
    const touristId = rawTourist
      ? rawTourist._id
        ? rawTourist._id.toString()
        : rawTourist.toString()
      : null;

    const guideId = rawGuide
      ? rawGuide._id
        ? rawGuide._id.toString()
        : rawGuide.toString()
      : null;

    const isTourist = touristId && touristId === userIdStr;
    const isGuide = guideId && guideId === userIdStr;

    if (!isTourist && !isGuide) {
      const error = new Error("You are not a participant in this call");
      error.status = 403;
      throw error;
    }

    // Determine role and uid
    const role = isTourist ? "tourist" : "guide";
    const uid = isTourist ? session.touristUid : session.guideUid;

    if (!uid) {
      const error = new Error(`Call session has no UID for role ${role}`);
      error.status = 500;
      throw error;
    }

    // Calculate expiry time (max duration + margin)
    const expirySeconds =
      session.maxDurationSeconds + AGORA_TOKEN_EXPIRY_MARGIN;

    // Get Agora credentials
    const appId = getAgoraAppId();
    if (!appId) {
      const error = new Error(
        "RTC service not configured. Missing AGORA_APP_ID."
      );
      error.status = 500;
      throw error;
    }

    // Build Agora token
    const token = buildRtcToken(session.channelName, uid, expirySeconds);

    // Update session to active if first join
    if (session.status === "ringing") {
      await callRepository.updateCallSession(callId, { status: "ongoing" });
    }

    return {
      appId,
      channelName: session.channelName,
      uid,
      token,
      maxDurationSeconds: session.maxDurationSeconds,
      callId: session._id,
      tripId: session.tripId,
      role,
    };
  }

  /**
   * Generate Agora token for user to join call
   * @param {String} callId - Call session ID
   * @param {String} userId - User requesting token
   * @param {String} role - 'tourist' or 'guide'
   * @returns {Promise<Object>} Token data
   */
  async generateToken(callId, userId, role) {
    const session = await callRepository.findById(callId);

    if (!session) {
      const error = new Error("Call session not found");
      error.status = 404;
      throw error;
    }

    // Verify user is participant
    const isTourist = session.touristUser._id.toString() === userId.toString();
    const isGuide = session.guideUser._id.toString() === userId.toString();

    if (!isTourist && !isGuide) {
      const error = new Error("You are not a participant in this call");
      error.status = 403;
      throw error;
    }

    // Verify role matches user type
    if ((role === "tourist" && !isTourist) || (role === "guide" && !isGuide)) {
      const error = new Error("Invalid role for this user");
      error.status = 403;
      throw error;
    }

    // Get UID based on role
    const uid = role === "tourist" ? session.touristUid : session.guideUid;

    // Calculate expiry time (max duration + margin)
    const expirySeconds =
      session.maxDurationSeconds + AGORA_TOKEN_EXPIRY_MARGIN;

    // Build Agora token
    const token = buildRtcToken(session.channelName, uid, expirySeconds);

    // Update session to active if first token request
    if (session.status === "ringing") {
      await callRepository.updateCallSession(callId, { status: "ongoing" });
    }

    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    return {
      appId: getAgoraAppId(),
      channelName: session.channelName,
      uid,
      token,
      expiresAt,
      maxDurationSeconds: session.maxDurationSeconds,
    };
  }

  /**
   * End call session
   * @param {String} callId - Call session ID
   * @param {String} endReason - Reason for ending
   * @param {String} summary - Optional summary of the call
   * @param {Number} negotiatedPrice - Optional negotiated price
   * @returns {Promise<Object>} Updated session
   */
  async endSession(
    callId,
    endReason = "completed",
    summary = null,
    negotiatedPrice = null
  ) {
    const session = await callRepository.findById(callId);

    if (!session) {
      const error = new Error("Call session not found");
      error.status = 404;
      throw error;
    }

    if (session.status === "ended") {
      return session; // Already ended
    }

    // Prepare update data
    const updateData = {
      status: "ended",
      endedAt: new Date(),
      endReason,
    };

    // Add optional fields if provided
    if (summary) {
      updateData.summary = summary;
    }
    if (negotiatedPrice !== null && negotiatedPrice !== undefined) {
      updateData.negotiatedPrice = negotiatedPrice;
    }

    // Update session
    const updatedSession = await callRepository.updateCallSession(
      callId,
      updateData
    );

    // Clear timeout if exists
    if (sessionTimeouts.has(callId)) {
      clearTimeout(sessionTimeouts.get(callId));
      sessionTimeouts.delete(callId);
    }

    return updatedSession;
  }

  /**
   * Schedule automatic session end after max duration
   * @param {String} callId - Call session ID
   * @param {Number} durationSeconds - Duration in seconds
   */
  scheduleAutoEnd(callId, durationSeconds) {
    const timeoutId = setTimeout(async () => {
      try {
        await this.endSession(callId, "timeout");
        console.log(
          `Call session ${callId} auto-ended after ${durationSeconds}s`
        );
      } catch (error) {
        console.error(`Failed to auto-end call session ${callId}:`, error);
      }
    }, durationSeconds * 1000);

    sessionTimeouts.set(callId, timeoutId);
  }

  /**
   * Get active call sessions for user
   * @param {String} userId - User ID
   * @returns {Promise<Array>} Active sessions
   */
  async getActiveSessionsByUser(userId) {
    return await callRepository.findActiveByUser(userId);
  }

  /**
   * Get call session by ID
   * @param {String} callId - Call session ID
   * @returns {Promise<Object>} Call session
   */
  async getSessionById(callId) {
    const session = await callRepository.findById(callId);

    if (!session) {
      const error = new Error("Call session not found");
      error.status = 404;
      throw error;
    }

    return session;
  }

  /**
   * Get incoming calls for a guide
   * @param {String} guideId - Guide User ID
   * @returns {Promise<Array>} List of incoming calls
   */
  async getIncomingCallsForGuide(guideId) {
    console.log(`[CALL_DEBUG] Fetching incoming calls for guide ${guideId}`);
    const calls = await callRepository.findIncomingCalls(guideId);
    console.log(
      `[CALL_DEBUG] Found ${calls.length} incoming calls for guide ${guideId}`
    );
    return calls;
  }
}

export default new CallService();

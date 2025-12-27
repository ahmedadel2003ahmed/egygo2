import mongoose from "mongoose";
import callService from "../services/callService.js";
import { HTTP_STATUS } from "../utils/constants.js";
import { asyncHandler } from "../middlewares/errorHandler.js";

/**
 * Call Controller - Handle video/audio call requests
 *
 * NOTE: This controller is DEPRECATED for trip calls.
 * Use newTripFlowController.initiateTripCall instead for the new trip-first flow.
 */

/**
 * Initiate call session (DEPRECATED - use /api/trips/:tripId/calls/initiate instead)
 * POST /api/calls/initiate
 */
export const initiateCall = asyncHandler(async (req, res) => {
  const touristUserId = req.user.userId;
  const { guideId } = req.body;
  const { tripId } = req.params;

  console.log("initiateCall IDs:", { tripId, guideId, touristUserId });

  // Validate trip ID format
  if (!mongoose.Types.ObjectId.isValid(tripId)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Invalid trip ID format",
    });
  }

  // Validate guide ID format
  if (!mongoose.Types.ObjectId.isValid(guideId)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Invalid guide ID format",
    });
  }

  // Validate tourist user ID format
  if (!mongoose.Types.ObjectId.isValid(touristUserId)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Invalid tourist user ID format",
    });
  }

  const session = await callService.createSession(
    touristUserId,
    guideId,
    tripId
  );

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: "Call session initiated successfully",
    data: {
      callId: session._id,
      channelName: session.channelName,
      status: session.status,
      maxDurationSeconds: session.maxDurationSeconds,
      tripId: session.tripId,
    },
  });
});

/**
 * Join call session - auto-detect role and get token
 * GET /api/calls/:callId/join
 */
export const joinCall = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { callId } = req.params;

  const joinData = await callService.joinCall(callId, userId);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: joinData,
  });
});

/**
 * Get Agora token to join call
 * GET /api/calls/:callId/token?role=tourist|guide
 */
export const getCallToken = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { callId } = req.params;
  const { role } = req.query;

  if (!role || !["tourist", "guide"].includes(role)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Role must be either "tourist" or "guide"',
    });
  }

  const tokenData = await callService.generateToken(callId, userId, role);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: tokenData,
  });
});

/**
 * End call session
 * POST /api/calls/:callId/end
 */
export const endCall = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { callId } = req.params;
  const { reason } = req.body;

  // Verify user is participant
  const session = await callService.getSessionById(callId);

  const isTourist = session.touristUser._id.toString() === userId.toString();
  const isGuide = session.guideUser._id.toString() === userId.toString();

  if (!isTourist && !isGuide) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: "You are not a participant in this call",
    });
  }

  const updatedSession = await callService.endSession(
    callId,
    reason || "completed"
  );
  console.log(`[CALL_DEBUG] Ended call ${callId} (User: ${userId}, Reason: ${reason || "completed"})`);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Call ended successfully",
    data: {
      callId: updatedSession._id,
      status: updatedSession.status,
      endReason: updatedSession.endReason,
      endedAt: updatedSession.endedAt,
    },
  });
});

/**
 * Get active call sessions for current user
 * GET /api/calls/active
 */
export const getActiveCalls = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const sessions = await callService.getActiveSessionsByUser(userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: sessions,
  });
});

/**
 * Get call session details
 * GET /api/calls/:callId
 */
export const getCallSession = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { callId } = req.params;

  const session = await callService.getSessionById(callId);

  // Verify user is participant
  const isTourist = session.touristUser._id.toString() === userId.toString();
  const isGuide = session.guideUser._id.toString() === userId.toString();

  if (!isTourist && !isGuide) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: "You are not a participant in this call",
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: session,
  });
});

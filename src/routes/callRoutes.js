import express from "express";
import * as callController from "../controllers/callController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { validateObjectId } from "../middlewares/validateObjectId.js";

const router = express.Router();

/**
 * Call Routes - /api/calls
 * Video/audio calling using Agora RTC
 *
 * NOTE: Call initiation is now handled by newTripFlowRoutes.js
 * POST /api/trips/:tripId/calls/initiate
 */

/**
 * @route   GET /api/calls/:callId/join
 * @desc    Join call session and get RTC token (auto-detect role)
 * @access  Private (Call participants only)
 */
router.get(
  "/:callId/join",
  validateObjectId("callId"),
  authenticate,
  callController.joinCall
);

/**
 * @route   GET /api/calls/:callId/token
 * @desc    Get Agora RTC token to join call
 * @access  Private (Call participants only)
 */
router.get("/:callId/token", authenticate, callController.getCallToken);

/**
 * NOTE: Call ending is now handled by newTripFlowRoutes.js with enhanced validation
 * POST /api/calls/:callId/end (with summary and negotiatedPrice)
 */

/**
 * @route   GET /api/calls/active
 * @desc    Get active call sessions for current user
 * @access  Private
 */
router.get("/active", authenticate, callController.getActiveCalls);

/**
 * @route   GET /api/calls/:callId
 * @desc    Get call session details
 * @access  Private (Call participants only)
 */
router.get("/:callId", authenticate, callController.getCallSession);

export default router;

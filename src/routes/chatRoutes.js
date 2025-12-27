import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import * as chatController from "../controllers/chatController.js";

const router = express.Router();

/**
 * Chat Routes
 *
 * All routes require authentication
 * Access is validated per trip based on user role
 */

/**
 * @route   GET /api/chat/:tripId/messages
 * @desc    Get chat messages for a trip
 * @access  Private (Tourist or Guide of the trip)
 * @query   limit: number (default: 100, max: 200)
 * @query   skip: number (default: 0)
 */
router.get("/:tripId/messages", authenticate, chatController.getTripMessages);

/**
 * @route   GET /api/chat/:tripId/access
 * @desc    Check if user can access chat for a trip
 * @access  Private
 */
router.get("/:tripId/access", authenticate, chatController.checkChatAccess);

/**
 * @route   POST /api/chat
 * @desc    AI Tour Guide Chat (Nefertiti)
 * @access  Public
 */
router.post("/", chatController.aiChat);

export default router;

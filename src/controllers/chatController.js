import chatService from "../services/chatService.js";
import aiChatService from "../services/aiChatService.js";
import { HTTP_STATUS } from "../utils/constants.js";

/**
 * Chat Controller
 *
 * Handles REST API endpoints for chat history retrieval
 */

/**
 * Get chat messages for a trip
 * GET /api/chat/:tripId/messages
 *
 * Query params:
 * - limit: number (default: 100, max: 200)
 * - skip: number (default: 0)
 */
export const getTripMessages = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { limit = 100, skip = 0 } = req.query;

    // Validate authentication
    if (!req.userId || !req.userRole) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Parse pagination params
    const parsedLimit = Math.min(parseInt(limit, 10) || 100, 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    // Get messages with access validation
    const result = await chatService.getMessages(
      tripId,
      req.userId.toString(),
      req.userRole,
      parsedLimit,
      parsedSkip
    );

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        messages: result.messages,
        total: result.total,
        limit: parsedLimit,
        skip: parsedSkip,
      },
    });
  } catch (error) {
    console.error("[ChatController] getTripMessages error:", error);

    // Handle specific validation errors
    if (
      error.message.includes("Unauthorized") ||
      error.message.includes("not found")
    ) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to retrieve messages",
      error: error.message,
    });
  }
};

/**
 * Check if user can access chat for a trip
 * GET /api/chat/:tripId/access
 */
export const checkChatAccess = async (req, res) => {
  try {
    const { tripId } = req.params;

    // Validate authentication
    if (!req.userId || !req.userRole) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Validate access
    const validation = await chatService.validateJoinChat(
      tripId,
      req.userId.toString(),
      req.userRole
    );

    if (!validation.valid) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: validation.error,
        data: {
          canAccess: false,
          reason: validation.error,
        },
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        canAccess: true,
        tripId,
      },
    });
  } catch (error) {
    console.error("[ChatController] checkChatAccess error:", error);

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to check chat access",
      error: error.message,
    });
  }
};

/**
 * AI Tour Guide Chat - Nefertiti
 * POST /api/chat
 *
 * Body:
 * - message: string (user query)
 */
export const aiChat = async (req, res) => {
  try {
    const { message } = req.body;

    // Validate request body
    if (!message || typeof message !== "string") {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Message is required",
      });
    }

    // Process chat through AI service
    const result = await aiChatService.processAIChat(message);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      type: result.type,
      content: result.content,
    });
  } catch (error) {
    console.error("[ChatController] aiChat error:", error);

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      type: "text",
      content: "حدث خطأ في الاتصال بخدمة الدردشة.",
    });
  }
};

export default {
  getTripMessages,
  checkChatAccess,
  aiChat,
};

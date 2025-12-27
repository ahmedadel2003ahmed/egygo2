import TripChatMessage from "../models/TripChatMessage.js";
import Trip from "../models/Trip.js";
import { ROLES } from "../utils/constants.js";
import { TRIP_STATES } from "../utils/tripStateMachine.js";

/**
 * Chat Service
 *
 * Handles all business logic for trip-based chat system
 *
 * STRICT RULES:
 * - Chat allowed only after guide is selected (selectedGuide exists)
 * - Tourist can only chat with their assigned guide
 * - Guide can only chat with the tourist of their assigned trip
 * - No chat in draft, selecting_guide, or cancelled states
 * - All operations must be validated before execution
 */

class ChatService {
  /**
   * States where chat is allowed
   * Chat is allowed once guide is selected and trip is active
   */
  static CHAT_ALLOWED_STATES = [
    TRIP_STATES.AWAITING_CALL,
    TRIP_STATES.IN_CALL,
    TRIP_STATES.PENDING_CONFIRMATION,
    TRIP_STATES.AWAITING_PAYMENT,
    TRIP_STATES.CONFIRMED,
    TRIP_STATES.IN_PROGRESS,
    TRIP_STATES.COMPLETED,
  ];

  /**
   * Validate if user can join chat for a trip
   * @param {string} tripId - Trip ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role (tourist or guide)
   * @returns {Promise<Object>} { valid: boolean, error?: string, trip?: Object }
   */
  async validateJoinChat(tripId, userId, userRole) {
    try {
      // Validate inputs
      if (!tripId || !userId || !userRole) {
        console.log("[ChatService] Validation failed: Missing parameters", {
          tripId,
          userId,
          userRole,
        });
        return {
          valid: false,
          error: "Missing required parameters: tripId, userId, or userRole",
        };
      }

      // Validate role
      if (![ROLES.TOURIST, ROLES.GUIDE].includes(userRole)) {
        console.log("[ChatService] Validation failed: Invalid role", {
          userRole,
        });
        return {
          valid: false,
          error: "Invalid role: only tourist and guide can access chat",
        };
      }

      // Get trip with guide user populated
      const trip = await Trip.findById(tripId)
        .select("tourist selectedGuide status")
        .populate("selectedGuide", "user")
        .lean();

      if (!trip) {
        console.log("[ChatService] Validation failed: Trip not found", {
          tripId,
        });
        return { valid: false, error: "Trip not found" };
      }

      console.log("[ChatService] Trip data:", {
        tripId: trip._id,
        tourist: trip.tourist,
        selectedGuide: trip.selectedGuide,
        status: trip.status,
      });

      // Check if guide is selected
      if (!trip.selectedGuide) {
        console.log("[ChatService] Validation failed: No guide selected");
        return {
          valid: false,
          error: "Chat not available: guide not selected yet",
        };
      }

      // Check if trip status allows chat
      if (!ChatService.CHAT_ALLOWED_STATES.includes(trip.status)) {
        console.log("[ChatService] Validation failed: Status not allowed", {
          status: trip.status,
          allowedStates: ChatService.CHAT_ALLOWED_STATES,
        });
        return {
          valid: false,
          error: `Chat not available in ${trip.status} state`,
        };
      }

      // Validate user belongs to trip
      const touristId = trip.tourist.toString();
      // Guide selectedGuide is populated, so we need to get the user ID from it
      const guideUserId =
        trip.selectedGuide?.user?.toString() ||
        trip.selectedGuide?.user ||
        trip.selectedGuide?.toString();

      console.log("[ChatService] Checking user authorization", {
        userRole,
        userId,
        touristId,
        guideUserId,
        selectedGuide: trip.selectedGuide,
      });

      if (userRole === ROLES.TOURIST) {
        if (touristId !== userId) {
          console.log(
            "[ChatService] Validation failed: User is not the tourist"
          );
          return {
            valid: false,
            error: "Unauthorized: you are not the tourist of this trip",
          };
        }
      } else if (userRole === ROLES.GUIDE) {
        if (guideUserId !== userId) {
          console.log(
            "[ChatService] Validation failed: User is not the guide",
            {
              guideUserId,
              userId,
            }
          );
          return {
            valid: false,
            error: "Unauthorized: you are not the guide of this trip",
          };
        }
      }

      console.log("[ChatService] Validation passed successfully");
      return { valid: true, trip };
    } catch (error) {
      console.error("[ChatService] validateJoinChat error:", error);
      return {
        valid: false,
        error: "Internal error validating chat access",
      };
    }
  }

  /**
   * Validate and prepare message data
   * @param {string} tripId - Trip ID
   * @param {string} senderId - Sender user ID
   * @param {string} senderRole - Sender role
   * @param {string} message - Message content
   * @returns {Promise<Object>} { valid: boolean, error?: string, data?: Object }
   */
  async validateSendMessage(tripId, senderId, senderRole, message) {
    try {
      // Validate message content
      if (!message || typeof message !== "string") {
        return { valid: false, error: "Message is required" };
      }

      const trimmedMessage = message.trim();
      if (trimmedMessage.length === 0) {
        return { valid: false, error: "Message cannot be empty" };
      }

      if (trimmedMessage.length > 5000) {
        return {
          valid: false,
          error: "Message exceeds maximum length of 5000 characters",
        };
      }

      // Validate chat access (same as join validation)
      const joinValidation = await this.validateJoinChat(
        tripId,
        senderId,
        senderRole
      );

      if (!joinValidation.valid) {
        return joinValidation;
      }

      const trip = joinValidation.trip;

      // Determine receiver
      // Note: trip.selectedGuide is populated with {_id, user}, so we need to get user ID
      const guideUserId =
        trip.selectedGuide?.user?._id?.toString() ||
        trip.selectedGuide?.user?.toString() ||
        trip.selectedGuide?.toString();

      const receiverId =
        senderRole === ROLES.TOURIST ? guideUserId : trip.tourist.toString();

      const receiverRole =
        senderRole === ROLES.TOURIST ? ROLES.GUIDE : ROLES.TOURIST;

      return {
        valid: true,
        data: {
          trip: tripId,
          sender: {
            user: senderId,
            role: senderRole,
          },
          receiver: {
            user: receiverId,
            role: receiverRole,
          },
          message: trimmedMessage,
        },
      };
    } catch (error) {
      console.error("[ChatService] validateSendMessage error:", error);
      return {
        valid: false,
        error: "Internal error validating message",
      };
    }
  }

  /**
   * Save message to database
   * @param {Object} messageData - Message data to save
   * @returns {Promise<Object>} Saved message
   */
  async saveMessage(messageData) {
    try {
      const message = new TripChatMessage(messageData);
      await message.save();

      // Return lean version without internal fields
      return {
        _id: message._id,
        trip: message.trip,
        sender: message.sender,
        receiver: message.receiver,
        message: message.message,
        createdAt: message.createdAt,
      };
    } catch (error) {
      console.error("[ChatService] saveMessage error:", error);
      throw new Error(`Failed to save message: ${error.message}`);
    }
  }

  /**
   * Get chat messages for a trip
   * @param {string} tripId - Trip ID
   * @param {string} userId - User ID requesting messages
   * @param {string} userRole - User role
   * @param {number} limit - Max messages to retrieve (default: 100)
   * @param {number} skip - Number of messages to skip (default: 0)
   * @returns {Promise<Object>} { messages: Array, total: number }
   */
  async getMessages(tripId, userId, userRole, limit = 100, skip = 0) {
    try {
      // Validate access
      const validation = await this.validateJoinChat(tripId, userId, userRole);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Get messages
      const messages = await TripChatMessage.getMessagesForTrip(
        tripId,
        Math.min(limit, 200), // Cap at 200
        Math.max(skip, 0)
      );

      const total = await TripChatMessage.countMessagesForTrip(tripId);

      return { messages, total };
    } catch (error) {
      console.error("[ChatService] getMessages error:", error);
      throw error;
    }
  }

  /**
   * Get room name for a trip
   * @param {string} tripId - Trip ID
   * @returns {string} Room name
   */
  getRoomName(tripId) {
    return `trip:${tripId}`;
  }
}

export default new ChatService();

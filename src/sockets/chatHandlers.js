import chatService from "../services/chatService.js";

/**
 * Socket.io Chat Event Handlers
 *
 * Handles real-time chat events for trip-based messaging
 *
 * EVENTS:
 * - join_trip_chat: Join a chat room for a specific trip
 * - send_message: Send a message in a trip chat
 * - leave_trip_chat: Leave a trip chat room
 *
 * EMITTED EVENTS:
 * - new_message: Broadcast new message to room
 * - chat_error: Error occurred in chat operation
 * - joined_chat: Confirmation of successful room join
 * - left_chat: Confirmation of leaving room
 */

/**
 * Initialize socket handlers for a given socket connection
 * @param {Socket} socket - Socket.io socket instance
 * @param {Server} io - Socket.io server instance
 */
export const initializeChatHandlers = (socket, io) => {
  console.log("[Chat Socket] Client connected", {
    socketId: socket.id,
    userId: socket.data.userId,
    role: socket.data.role,
  });

  /**
   * Join a trip chat room
   * Client sends: { tripId: string }
   */
  socket.on("join_trip_chat", async (data) => {
    try {
      const { tripId } = data;

      console.log("[Chat Socket] join_trip_chat requested", {
        socketId: socket.id,
        userId: socket.data.userId,
        role: socket.data.role,
        tripId,
      });

      if (!tripId) {
        socket.emit("chat_error", {
          event: "join_trip_chat",
          error: "Trip ID is required",
        });
        return;
      }

      // Validate access
      const validation = await chatService.validateJoinChat(
        tripId,
        socket.data.userId,
        socket.data.role
      );

      if (!validation.valid) {
        console.error("[Chat Socket] join_trip_chat validation failed", {
          socketId: socket.id,
          userId: socket.data.userId,
          tripId,
          error: validation.error,
        });

        socket.emit("chat_error", {
          event: "join_trip_chat",
          error: validation.error,
        });
        return;
      }

      // Join room
      const roomName = chatService.getRoomName(tripId);
      await socket.join(roomName);

      // Store trip in socket data for cleanup
      socket.data.currentTripRoom = roomName;

      console.log("[Chat Socket] join_trip_chat success", {
        socketId: socket.id,
        userId: socket.data.userId,
        tripId,
        roomName,
      });

      // Confirm join
      socket.emit("joined_chat", {
        tripId,
        roomName,
        message: "Successfully joined chat",
      });
    } catch (error) {
      console.error("[Chat Socket] join_trip_chat error", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });

      socket.emit("chat_error", {
        event: "join_trip_chat",
        error: "Failed to join chat: Internal server error",
      });
    }
  });

  /**
   * Send a message in a trip chat
   * Client sends: { tripId: string, message: string }
   */
  socket.on("send_message", async (data) => {
    try {
      const { tripId, message } = data;

      console.log("[Chat Socket] send_message requested", {
        socketId: socket.id,
        userId: socket.data.userId,
        role: socket.data.role,
        tripId,
        messageLength: message?.length,
      });

      if (!tripId || !message) {
        socket.emit("chat_error", {
          event: "send_message",
          error: "Trip ID and message are required",
        });
        return;
      }

      // Validate and prepare message
      const validation = await chatService.validateSendMessage(
        tripId,
        socket.data.userId,
        socket.data.role,
        message
      );

      if (!validation.valid) {
        console.error("[Chat Socket] send_message validation failed", {
          socketId: socket.id,
          userId: socket.data.userId,
          tripId,
          error: validation.error,
        });

        socket.emit("chat_error", {
          event: "send_message",
          error: validation.error,
        });
        return;
      }

      // Save message to database
      const savedMessage = await chatService.saveMessage(validation.data);

      console.log("[Chat Socket] send_message success", {
        socketId: socket.id,
        userId: socket.data.userId,
        tripId,
        messageId: savedMessage._id,
      });

      // Broadcast to room (including sender)
      const roomName = chatService.getRoomName(tripId);
      io.to(roomName).emit("new_message", {
        _id: savedMessage._id,
        trip: savedMessage.trip,
        sender: savedMessage.sender,
        receiver: savedMessage.receiver,
        message: savedMessage.message,
        createdAt: savedMessage.createdAt,
      });
    } catch (error) {
      console.error("[Chat Socket] send_message error", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });

      socket.emit("chat_error", {
        event: "send_message",
        error: "Failed to send message: Internal server error",
      });
    }
  });

  /**
   * Leave a trip chat room
   * Client sends: { tripId: string }
   */
  socket.on("leave_trip_chat", async (data) => {
    try {
      const { tripId } = data;

      console.log("[Chat Socket] leave_trip_chat requested", {
        socketId: socket.id,
        userId: socket.data.userId,
        tripId,
      });

      if (!tripId) {
        socket.emit("chat_error", {
          event: "leave_trip_chat",
          error: "Trip ID is required",
        });
        return;
      }

      const roomName = chatService.getRoomName(tripId);
      await socket.leave(roomName);

      // Clear stored trip room
      if (socket.data.currentTripRoom === roomName) {
        socket.data.currentTripRoom = null;
      }

      console.log("[Chat Socket] leave_trip_chat success", {
        socketId: socket.id,
        userId: socket.data.userId,
        tripId,
        roomName,
      });

      socket.emit("left_chat", {
        tripId,
        message: "Successfully left chat",
      });
    } catch (error) {
      console.error("[Chat Socket] leave_trip_chat error", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });

      socket.emit("chat_error", {
        event: "leave_trip_chat",
        error: "Failed to leave chat: Internal server error",
      });
    }
  });

  /**
   * Handle socket disconnection
   */
  socket.on("disconnect", (reason) => {
    console.log("[Chat Socket] Client disconnected", {
      socketId: socket.id,
      userId: socket.data.userId,
      role: socket.data.role,
      reason,
    });

    // Cleanup is automatic - socket leaves all rooms on disconnect
  });

  /**
   * Handle connection errors
   */
  socket.on("error", (error) => {
    console.error("[Chat Socket] Socket error", {
      socketId: socket.id,
      userId: socket.data.userId,
      error: error.message,
    });
  });
};

export default {
  initializeChatHandlers,
};

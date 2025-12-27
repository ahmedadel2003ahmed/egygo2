/**
 * Trip Socket Handlers
 *
 * Handles trip-related socket events for real-time updates
 * This is a NON-BLOCKING layer - failures here do not affect core trip logic
 */

/**
 * Initialize trip socket handlers for a connected socket
 *
 * @param {Socket} socket - Socket.io socket instance
 * @param {Server} _io - Socket.io server instance (unused but kept for consistency)
 */
// eslint-disable-next-line no-unused-vars
export const initializeTripHandlers = (socket, _io) => {
  // Event: join_trip_room
  // Client joins a specific trip room to receive status updates
  socket.on("join_trip_room", (data) => {
    try {
      const { tripId } = data;

      if (!tripId) {
        console.warn("[TripSocket] join_trip_room called without tripId");
        return;
      }

      const roomName = `trip:${tripId}`;
      socket.join(roomName);

      console.log(`[TripSocket] User ${socket.userId} joined room ${roomName}`);

      // Optionally send confirmation
      socket.emit("trip_room_joined", { tripId, room: roomName });
    } catch (error) {
      // Log but don't crash - socket errors must not affect business logic
      console.error("[TripSocket] Error in join_trip_room:", error.message);
    }
  });

  // Event: leave_trip_room
  // Client leaves a trip room
  socket.on("leave_trip_room", (data) => {
    try {
      const { tripId } = data;

      if (!tripId) {
        console.warn("[TripSocket] leave_trip_room called without tripId");
        return;
      }

      const roomName = `trip:${tripId}`;
      socket.leave(roomName);

      console.log(`[TripSocket] User ${socket.userId} left room ${roomName}`);

      // Optionally send confirmation
      socket.emit("trip_room_left", { tripId, room: roomName });
    } catch (error) {
      // Log but don't crash - socket errors must not affect business logic
      console.error("[TripSocket] Error in leave_trip_room:", error.message);
    }
  });

  // Clean up on disconnect
  socket.on("disconnect", () => {
    console.log(`[TripSocket] User ${socket.userId} disconnected`);
  });
};

export default {
  initializeTripHandlers,
};

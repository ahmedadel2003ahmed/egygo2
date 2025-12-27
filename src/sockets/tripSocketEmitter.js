/**
 * Trip Socket Emitter Service
 *
 * NON-BLOCKING service for emitting trip status updates to connected clients
 * This layer is completely optional - if it fails, the system continues normally
 */

// Store the io instance (will be set by initialization)
let ioInstance = null;

/**
 * Set the Socket.io server instance
 * Called during server initialization
 *
 * @param {Server} io - Socket.io server instance
 */
export const setSocketInstance = (io) => {
  ioInstance = io;
  console.log("[TripSocketEmitter] Socket instance registered");
};

/**
 * Emit trip status update to all clients in the trip room
 *
 * This is a NON-BLOCKING function:
 * - Never throws errors
 * - Failures are logged but don't affect calling code
 * - System works normally even if socket server is down
 *
 * @param {Object} trip - Trip document with _id and status
 */
export const emitTripStatusUpdate = (trip) => {
  try {
    // If socket not initialized, skip silently
    if (!ioInstance) {
      console.warn("[TripSocketEmitter] Socket not initialized, skipping emit");
      return;
    }

    // Validate trip object
    if (!trip || !trip._id || !trip.status) {
      console.warn("[TripSocketEmitter] Invalid trip object, skipping emit");
      return;
    }

    const tripId = trip._id.toString();
    const roomName = `trip:${tripId}`;

    // Prepare payload - only send essential data
    const payload = {
      tripId,
      status: trip.status,
      timestamp: new Date().toISOString(),
    };

    // Add optional fields if available
    if (trip.paymentStatus) {
      payload.paymentStatus = trip.paymentStatus;
    }
    if (trip.confirmedAt) {
      payload.confirmedAt = trip.confirmedAt;
    }
    if (trip.cancelledAt) {
      payload.cancelledAt = trip.cancelledAt;
    }
    if (trip.cancelledBy) {
      payload.cancelledBy = trip.cancelledBy;
    }

    // Emit to room
    ioInstance.to(roomName).emit("trip_status_updated", payload);

    console.log(`[TripSocketEmitter] Emitted status update to ${roomName}:`, {
      tripId,
      status: trip.status,
    });
  } catch (error) {
    // CRITICAL: Never throw - log and continue
    console.error("[TripSocketEmitter] Error emitting trip status update:", {
      error: error.message,
      tripId: trip?._id?.toString(),
      status: trip?.status,
    });
  }
};

export default {
  setSocketInstance,
  emitTripStatusUpdate,
};

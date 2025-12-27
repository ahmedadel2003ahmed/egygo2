import { Server } from "socket.io";
import { authenticateSocket } from "../middlewares/socketAuthMiddleware.js";
import { initializeChatHandlers } from "./chatHandlers.js";
import { initializeTripHandlers } from "./tripHandlers.js";
import { setSocketInstance } from "./tripSocketEmitter.js";

/**
 * Initialize Socket.io Server
 *
 * Sets up Socket.io with authentication, chat handlers, and trip handlers
 *
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} Socket.io server instance
 */
export const initializeSocketServer = (httpServer) => {
  // Create Socket.io server with CORS configuration
  const io = new Server(httpServer, {
    cors: {
      origin: [
        process.env.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
      ].filter(Boolean),
      credentials: true,
      methods: ["GET", "POST"],
    },
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000,
    // Transport settings
    transports: ["websocket", "polling"],
    // Allow upgrades from polling to websocket
    allowUpgrades: true,
  });

  console.log("[Socket.io] Server initialized");

  // Register io instance for trip status emitter
  setSocketInstance(io);

  // Apply authentication middleware to all connections
  io.use(authenticateSocket);

  // Handle new socket connections
  io.on("connection", (socket) => {
    // Initialize chat handlers for this socket
    initializeChatHandlers(socket, io);

    // Initialize trip handlers for this socket
    initializeTripHandlers(socket, io);
  });

  // Handle server errors
  io.engine.on("connection_error", (err) => {
    console.error("[Socket.io] Connection error:", {
      code: err.code,
      message: err.message,
      context: err.context,
    });
  });

  return io;
};

export default {
  initializeSocketServer,
};

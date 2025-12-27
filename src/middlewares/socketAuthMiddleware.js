import tokenService from "../services/tokenService.js";
import userRepository from "../repositories/userRepository.js";
import { ROLES } from "../utils/constants.js";

/**
 * Socket.io Authentication Middleware
 *
 * Validates JWT token on socket connection
 * Attaches userId and role to socket.data for use in socket handlers
 *
 * SECURITY RULES:
 * - Token must be present in auth.token or handshake query
 * - Token must be valid JWT
 * - User must exist and be active
 * - Invalid sockets are IMMEDIATELY disconnected
 */

/**
 * Authenticate socket connection using JWT
 * @param {Socket} socket - Socket.io socket instance
 * @param {Function} next - Next middleware function
 */
export const authenticateSocket = async (socket, next) => {
  try {
    // Extract token from auth object or query params
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      console.error("[Socket Auth] No token provided", {
        socketId: socket.id,
        handshake: {
          auth: socket.handshake.auth,
          query: socket.handshake.query,
        },
      });
      return next(new Error("Authentication failed: No token provided"));
    }

    // Verify token
    let decoded;
    try {
      decoded = tokenService.verifyAccessToken(token);
    } catch (error) {
      console.error("[Socket Auth] Token verification failed", {
        socketId: socket.id,
        error: error.message,
      });
      return next(new Error(`Authentication failed: ${error.message}`));
    }

    // Validate decoded token structure
    if (!decoded.userId || !decoded.role) {
      console.error("[Socket Auth] Invalid token structure", {
        socketId: socket.id,
        decoded,
      });
      return next(new Error("Authentication failed: Invalid token structure"));
    }

    // Get user from database
    const user = await userRepository.findById(decoded.userId);

    if (!user) {
      console.error("[Socket Auth] User not found", {
        socketId: socket.id,
        userId: decoded.userId,
      });
      return next(new Error("Authentication failed: User not found"));
    }

    if (!user.isActive) {
      console.error("[Socket Auth] User is inactive", {
        socketId: socket.id,
        userId: decoded.userId,
      });
      return next(new Error("Authentication failed: User is inactive"));
    }

    // Validate role matches
    if (user.role !== decoded.role) {
      console.error("[Socket Auth] Role mismatch", {
        socketId: socket.id,
        userId: decoded.userId,
        tokenRole: decoded.role,
        userRole: user.role,
      });
      return next(new Error("Authentication failed: Role mismatch"));
    }

    // Attach user data to socket
    socket.data.userId = user._id.toString();
    socket.data.role = user.role;
    socket.data.userEmail = user.email;

    console.log("[Socket Auth] Authentication successful", {
      socketId: socket.id,
      userId: socket.data.userId,
      role: socket.data.role,
    });

    next();
  } catch (error) {
    console.error("[Socket Auth] Unexpected error", {
      socketId: socket.id,
      error: error.message,
      stack: error.stack,
    });
    return next(new Error("Authentication failed: Internal server error"));
  }
};

/**
 * Verify that socket user has the required role
 * @param {Socket} socket - Socket.io socket instance
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 * @returns {boolean} true if authorized
 */
export const authorizeSocketRole = (socket, allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return socket.data.role && roles.includes(socket.data.role);
};

/**
 * Verify that socket user is either tourist or guide (no admin)
 * @param {Socket} socket - Socket.io socket instance
 * @returns {boolean} true if authorized
 */
export const isSocketUserOrGuide = (socket) => {
  return authorizeSocketRole(socket, [ROLES.TOURIST, ROLES.GUIDE]);
};

export default {
  authenticateSocket,
  authorizeSocketRole,
  isSocketUserOrGuide,
};

import { HTTP_STATUS, ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Role-based access control middleware
 * @param {string[]} allowedRoles - Array of allowed roles
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.userRole) {
      console.log('Role check failed: No user or role attached to request');
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED,
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      console.log(`Role check failed: User role '${req.userRole}' not in allowed roles: ${allowedRoles.join(', ')}`);
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.FORBIDDEN,
      });
    }

    next();
  };
};

/**
 * Check if user is admin
 */
export const requireAdmin = requireRole(['admin']);

/**
 * Check if user is guide
 */
export const requireGuide = requireRole(['guide', 'admin']);

/**
 * Check if user is tourist
 */
export const requireTourist = requireRole(['tourist', 'admin']);

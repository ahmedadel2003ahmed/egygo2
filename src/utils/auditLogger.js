import auditLogRepository from '../repositories/auditLogRepository.js';

/**
 * Log audit events
 * @param {Object} params - Audit log parameters
 * @param {string} params.userId - User ID
 * @param {string} params.action - Action performed
 * @param {string} params.resourceType - Type of resource
 * @param {string} params.resourceId - ID of resource
 * @param {Object} params.details - Additional details
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent
 */
export const logAudit = async ({
  userId,
  action,
  resourceType,
  resourceId,
  details,
  ipAddress,
  userAgent,
}) => {
  try {
    await auditLogRepository.create({
      user: userId,
      action,
      resourceType,
      resourceId,
      details,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Audit logging failed:', error);
    // Don't throw - audit logging should not break main flow
  }
};

/**
 * Extract IP address from request
 */
export const getIpAddress = (req) => {
  return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
};

/**
 * Extract user agent from request
 */
export const getUserAgent = (req) => {
  return req.headers['user-agent'] || 'Unknown';
};

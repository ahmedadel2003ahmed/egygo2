import guideService from '../services/guideService.js';
import { HTTP_STATUS, DOCUMENT_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getIpAddress, getUserAgent } from '../utils/auditLogger.js';

/**
 * Admin Guide Controller - Handle admin operations for guides
 */

/**
 * Get all pending guides
 * GET /api/admin/guides/pending
 */
export const getPendingGuides = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  const guides = await guideService.getPendingGuides(options);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: guides,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * Get guide details
 * GET /api/admin/guides/:guideId
 */
export const getGuideDetails = asyncHandler(async (req, res) => {
  const guide = await guideService.getGuideProfile(req.params.guideId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: guide,
  });
});

/**
 * Get guide documents
 * GET /api/admin/guides/:guideId/documents
 */
export const getGuideDocuments = asyncHandler(async (req, res) => {
  const documents = await guideService.getGuideDocuments(req.params.guideId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: documents,
  });
});

/**
 * Verify/approve/reject guide document
 * PUT /api/admin/guides/:guideId/verify
 */
export const verifyGuideDocument = asyncHandler(async (req, res) => {
  const { documentId, status, note } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  // Validate status
  if (![DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.REJECTED].includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Invalid status. Must be "approved" or "rejected"',
    });
  }

  const result = await guideService.verifyGuideDocuments(
    req.params.guideId,
    documentId,
    status,
    note,
    req.userId,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

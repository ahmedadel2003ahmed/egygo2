import guideService from "../services/guideService.js";
import tripService from "../services/tripService.js";
import guideRepository from "../repositories/guideRepository.js";
import { HTTP_STATUS } from "../utils/constants.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { getIpAddress, getUserAgent } from "../utils/auditLogger.js";

import callService from "../services/callService.js";

/**
 * Guide Controller - Handle guide-specific requests
 */

/**
 * Get incoming calls for guide
 * GET /api/guide/calls/incoming
 */
export const getIncomingCalls = asyncHandler(async (req, res) => {
  const guideUserId = req.userId;
  const calls = await callService.getIncomingCallsForGuide(guideUserId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: calls,
  });
});

/**
 * Apply as guide (with document uploads)
 * POST /api/guide/apply
 */
export const applyAsGuide = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await guideService.applyAsGuide(
    req.userId,
    req.body,
    req.files,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

/**
 * Upload additional document
 * POST /api/guide/documents
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  const { type } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  if (!req.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Document file is required",
    });
  }

  const result = await guideService.uploadDocument(
    req.userId,
    req.file,
    type,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

/**
 * Update guide profile
 * PUT /api/guide/profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await guideService.updateProfile(
    req.userId,
    req.body,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Get own guide profile
 * GET /api/guide/profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  const guide = await guideRepository.findByUserId(req.userId);

  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: guide,
  });
});

/**
 * Get guide documents
 * GET /api/guide/documents
 */
export const getDocuments = asyncHandler(async (req, res) => {
  const guide = await guideRepository.findByUserId(req.userId);

  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: guide.documents,
  });
});

/**
 * Delete document
 * DELETE /api/guide/documents/:documentId
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await guideService.deleteDocument(
    req.userId,
    req.params.documentId,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Get guide trips
 * GET /api/guide/trips
 */
export const getTrips = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  // Get guide ID from user ID
  const guide = await guideRepository.findByUserId(req.userId);
  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  const trips = await tripService.getGuideTrips(guide._id, options);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: trips,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * Get single trip
 * GET /api/guide/trips/:id
 */
export const getTrip = asyncHandler(async (req, res) => {
  const trip = await tripService.getTripById(req.params.id);

  // Get guide ID
  const guide = await guideRepository.findByUserId(req.userId);
  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  // Verify guide owns this trip (check both guide and selectedGuide for new flow compatibility)
  const tripGuideId = trip.guide?._id?.toString();
  const tripSelectedGuideId = trip.selectedGuide?._id?.toString();
  const guideIdStr = guide._id.toString();

  console.log("[GUIDE_AUTH_DEBUG] Authorization check:", {
    guideIdStr,
    tripGuideId,
    tripSelectedGuideId,
    hasGuide: !!trip.guide,
    hasSelectedGuide: !!trip.selectedGuide,
    tripStatus: trip.status,
  });

  if (tripGuideId !== guideIdStr && tripSelectedGuideId !== guideIdStr) {
    console.log("[GUIDE_AUTH_DEBUG] Access denied - guide ID mismatch");
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: "Access denied",
    });
  }

  console.log("[GUIDE_AUTH_DEBUG] Access granted");

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: trip,
  });
});

/**
 * Accept trip request
 * PUT /api/guide/trips/:id/accept
 */
export const acceptTrip = asyncHandler(async (req, res, next) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  // Get guide ID
  const guide = await guideRepository.findByUserId(req.userId);
  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  try {
    const result = await tripService.acceptTrip(
      guide._id,
      req.params.id,
      ipAddress,
      userAgent
    );

    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    // Handle specific error cases
    if (error.status === 409) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: error.message,
        conflictingTripId: error.conflictingTripId,
      });
    }
    if (error.status === 403) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: error.message,
      });
    }
    if (error.status === 404) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: error.message,
      });
    }

    // Pass other errors to error handler
    next(error);
  }
});

/**
 * Reject trip request
 * PUT /api/guide/trips/:id/reject
 */
export const rejectTrip = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  // Get guide ID
  const guide = await guideRepository.findByUserId(req.userId);
  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  const result = await tripService.rejectTrip(
    guide._id,
    req.params.id,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Complete trip
 * PUT /api/guide/trips/:id/complete
 */
export const completeTrip = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  // Get guide ID
  const guide = await guideRepository.findByUserId(req.userId);
  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  const result = await tripService.completeTrip(
    guide._id,
    req.params.id,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Cancel trip
 * PUT /api/guide/trips/:id/cancel
 */
export const cancelTrip = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  // Get guide ID
  const guide = await guideRepository.findByUserId(req.userId);
  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  const result = await tripService.cancelTrip(
    guide._id,
    req.params.id,
    reason,
    "guide",
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Propose changes to trip itinerary or start time
 * PUT /api/guide/trips/:id/propose-change
 */
export const proposeChange = asyncHandler(async (req, res, next) => {
  const { proposedItinerary, proposedStartAt, note } = req.body;

  // Get guide ID
  const guide = await guideRepository.findByUserId(req.userId);
  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  try {
    const result = await tripService.proposeChange(guide._id, req.params.id, {
      proposedItinerary,
      proposedStartAt,
      note,
    });

    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    // Handle specific error cases
    if (error.status === 403) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: error.message,
      });
    }
    if (error.status === 404) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: error.message,
      });
    }
    if (error.status === 400) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }

    // Pass other errors to error handler
    next(error);
  }
});

/**
 * Task 2: List guides by province
 * GET /api/provinces/:slug/guides
 */
export const listGuidesByProvince = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const filters = {
    language: req.query.language,
    maxPrice: req.query.maxPrice,
    verified: req.query.verified,
    page: req.query.page || 1,
    limit: req.query.limit || 20,
    near: req.query.near, // format: "lat,lng"
    radius: req.query.radius, // in meters
    sort: req.query.sort || "rating",
  };

  const result = await guideService.listGuidesByProvince(slug, filters);
  res.status(HTTP_STATUS.OK).json(result);
});

/**
 * Task 2: Get guide details by ID or slug
 * GET /api/guides/:id
 */
export const getGuideDetails = asyncHandler(async (req, res) => {
  const result = await guideService.getGuideDetails(req.params.id);
  res.status(HTTP_STATUS.OK).json(result);
});

/**
 * Task 2: Create or update own guide profile
 * POST /api/guides/me/profile
 */
export const createOrUpdateProfile = asyncHandler(async (req, res) => {
  const result = await guideService.registerOrUpdateProfile(
    req.userId,
    req.body
  );
  res.status(HTTP_STATUS.OK).json(result);
});

/**
 * Task 2: Upload document for guide
 * POST /api/guides/:id/documents
 */
export const uploadGuideDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "File is required",
    });
  }

  const fileMeta = {
    url: req.file.path, // Cloudinary URL after upload
    publicId: req.file.filename, // Cloudinary public ID
    type: req.body.type || "other",
  };

  const result = await guideService.uploadGuideDocument(
    req.userId,
    req.params.id,
    fileMeta
  );

  res.status(HTTP_STATUS.CREATED).json(result);
});

/**
 * Task 2: Get own guide profile
 * GET /api/guides/me
 */
export const getOwnProfile = asyncHandler(async (req, res) => {
  const guide = await guideRepository.findByUserId(req.userId);

  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Guide profile not found",
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: guide,
  });
});

/**
 * Upload gallery images
 * POST /api/guide/gallery
 */
export const uploadGalleryImages = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  if (!req.files || req.files.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "No images provided",
    });
  }

  const result = await guideService.uploadGalleryImages(
    req.userId,
    req.files,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

/**
 * Delete gallery image
 * DELETE /api/guide/gallery/:imageId
 */
export const deleteGalleryImage = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await guideService.deleteGalleryImage(
    req.userId,
    req.params.imageId,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

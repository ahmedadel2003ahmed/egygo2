import authService from '../services/authService.js';
import attractionService from '../services/attractionService.js';
import guideRepository from '../repositories/guideRepository.js';
import tripService from '../services/tripService.js';
import notificationService from '../services/notificationService.js';
import cloudinaryService from '../services/cloudinaryService.js';
import { HTTP_STATUS, CLOUDINARY_FOLDERS } from '../utils/constants.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getIpAddress, getUserAgent } from '../utils/auditLogger.js';

/**
 * Tourist Controller - Handle tourist-specific requests
 */

/**
 * Update tourist profile
 * PUT /api/tourist/profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const updateData = {};

  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;

  // Handle avatar upload if provided
  if (req.file) {
    const folder = `${CLOUDINARY_FOLDERS.TOURISTS}/${req.userId}`;
    const upload = await cloudinaryService.uploadFile(req.file.path, folder);
    updateData.avatar = {
      url: upload.url,
      publicId: upload.publicId,
    };
  }

  const user = await authService.updateProfile(req.userId, updateData);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: user,
    message: 'Profile updated successfully',
  });
});

/**
 * Get tourist profile
 * GET /api/tourist/profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: user,
  });
});

/**
 * Browse attractions
 * GET /api/tourist/attractions?city=Giza
 */
export const getAttractions = asyncHandler(async (req, res) => {
  const { city, page = 1, limit = 20 } = req.query;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  let attractions;
  if (city) {
    attractions = await attractionService.searchByCity(city, options);
  } else {
    attractions = await attractionService.getAllAttractions(options);
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: attractions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * Get single attraction
 * GET /api/tourist/attractions/:id
 */
export const getAttraction = asyncHandler(async (req, res) => {
  const attraction = await attractionService.getAttractionById(req.params.id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: attraction,
  });
});

/**
 * Browse guides with filters
 * GET /api/tourist/guides?city=&language=&priceMin=&priceMax=
 */
export const getGuides = asyncHandler(async (req, res) => {
  const { language, priceMin, priceMax, page = 1, limit = 20 } = req.query;

  const filters = {};

  if (language) {
    filters.languages = Array.isArray(language) ? language : [language];
  }

  if (priceMin) filters.priceMin = parseFloat(priceMin);
  if (priceMax) filters.priceMax = parseFloat(priceMax);

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  const guides = await guideRepository.search(filters, options);

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
 * Get single guide
 * GET /api/tourist/guides/:id
 */
export const getGuide = asyncHandler(async (req, res) => {
  const guide = await guideRepository.findById(req.params.id);

  if (!guide) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Guide not found',
    });
  }

  // Don't expose sensitive document details to tourists
  const guideData = guide.toObject();
  delete guideData.documents;

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: guideData,
  });
});

/**
 * Get tourist trips
 * GET /api/tourist/trips
 */
export const getTrips = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  const trips = await tripService.getTouristTrips(req.userId, options);

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
 * GET /api/tourist/trips/:id
 */
export const getTrip = asyncHandler(async (req, res) => {
  const trip = await tripService.getTripById(req.params.id);

  // Verify tourist owns this trip
  if (trip.tourist._id.toString() !== req.userId.toString()) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Access denied',
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: trip,
  });
});

/**
 * Create trip request (NEW FLOW - requires call agreement or explicit confirmation)
 * POST /api/tourist/trips
 * 
 * BREAKING CHANGE: Now requires either callId OR explicit agreement
 */
export const createTrip = asyncHandler(async (req, res) => {
  const { 
    guideId,
    negotiatedPrice,
    startAt, 
    totalDurationMinutes,
    meetingPoint, 
    meetingAddress, 
    itinerary,
    callId,
    agreedByBoth,
    agreementNote,
    createdFromPlaceId 
  } = req.body;

  // Validate required new fields
  if (!guideId) {
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: 'guideId is required',
      code: 'GUIDE_REQUIRED',
    });
  }

  if (negotiatedPrice === undefined || negotiatedPrice === null) {
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: 'negotiatedPrice is required',
      code: 'PRICE_REQUIRED',
    });
  }

  // Create trip using TripService (validation happens inside service)
  const trip = await tripService.createTrip({
    touristId: req.userId,
    guideId,
    negotiatedPrice,
    startAt,
    totalDurationMinutes,
    meetingPoint,
    meetingAddress,
    itinerary: itinerary || [],
    callId,
    agreedByBoth,
    agreementNote,
    createdFromPlaceId,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: trip,
    message: 'Trip created successfully. Awaiting guide confirmation.',
  });
});

/**
 * Convert completed call to suggested trip payload (NEW ENDPOINT)
 * POST /api/calls/:callId/convert-to-trip
 * 
 * Helper endpoint that returns suggested trip parameters based on a completed call.
 * Does NOT create the trip - client must call POST /api/tourist/trips with the payload.
 */
export const convertCallToTrip = asyncHandler(async (req, res) => {
  const { callId } = req.params;

  const suggestedPayload = await tripService.prepareTripFromCall(callId, req.userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: suggestedPayload,
    message: 'Trip payload prepared from call. Review and POST to /api/tourist/trips to create.',
  });
});

/**
 * Cancel trip
 * PUT /api/tourist/trips/:id/cancel
 */
export const cancelTrip = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await tripService.cancelTrip(
    req.userId,
    req.params.id,
    reason,
    'tourist',
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Review a completed trip
 * POST /api/tourist/trips/:id/review
 */
export const reviewTrip = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await tripService.reviewTrip(
    req.userId,
    req.params.id,
    { rating, comment },
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Accept guide's proposal for trip changes
 * PUT /api/tourist/trips/:id/accept-proposal
 */
export const acceptProposal = asyncHandler(async (req, res, next) => {
  try {
    const result = await tripService.acceptProposal(req.userId, req.params.id);

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
 * Reject guide's proposal for trip changes
 * PUT /api/tourist/trips/:id/reject-proposal
 */
export const rejectProposal = asyncHandler(async (req, res, next) => {
  const { rejectionNote } = req.body;

  try {
    const result = await tripService.rejectProposal(req.userId, req.params.id, rejectionNote);

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

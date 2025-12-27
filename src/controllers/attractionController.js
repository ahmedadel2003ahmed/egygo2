import attractionService from '../services/attractionService.js';
import { HTTP_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../middlewares/errorHandler.js';

/**
 * Attraction Controller - Handle attraction-related requests
 */

/**
 * Create attraction (admin only)
 * POST /api/attractions
 */
export const createAttraction = asyncHandler(async (req, res) => {
  const result = await attractionService.createAttraction(req.body);

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

/**
 * Get all attractions
 * GET /api/attractions
 */
export const getAllAttractions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  const attractions = await attractionService.getAllAttractions(options);

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
 * Get attraction by ID
 * GET /api/attractions/:id
 */
export const getAttractionById = asyncHandler(async (req, res) => {
  const attraction = await attractionService.getAttractionById(req.params.id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: attraction,
  });
});

/**
 * Update attraction (admin only)
 * PUT /api/attractions/:id
 */
export const updateAttraction = asyncHandler(async (req, res) => {
  const result = await attractionService.updateAttraction(req.params.id, req.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Delete attraction (admin only)
 * DELETE /api/attractions/:id
 */
export const deleteAttraction = asyncHandler(async (req, res) => {
  const result = await attractionService.deleteAttraction(req.params.id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Book trip from attraction page (convenience endpoint for tourists)
 * POST /api/attractions/:id/book-from-planner
 */
export const bookFromPlace = asyncHandler(async (req, res) => {
  const touristId = req.user.userId;
  const attractionId = req.params.id;
  const bookingData = req.body;

  const result = await attractionService.bookFromPlace(attractionId, touristId, bookingData);

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

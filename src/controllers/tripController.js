import tripService from '../services/tripService.js';
import { HTTP_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../middlewares/errorHandler.js';

/**
 * Trip Controller - Handle trip-related requests (shared endpoints)
 * 
 * NOTE: Trip creation is handled in newTripFlowController.js
 * This controller only handles shared utility endpoints (list, details)
 */

/**
 * Get all trips (admin only)
 * GET /api/trips
 */
export const getAllTrips = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const filter = {};
  if (status) filter.status = status;

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
 * Get trip by ID
 * GET /api/trips/:id
 */
export const getTripById = asyncHandler(async (req, res) => {
  const trip = await tripService.getTripById(req.params.id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: trip,
  });
});

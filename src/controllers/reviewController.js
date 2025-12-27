import reviewService from "../services/reviewService.js";
import { HTTP_STATUS } from "../utils/constants.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { getIpAddress, getUserAgent } from "../utils/auditLogger.js";

/**
 * Review Controller - Handle review-related requests
 */

/**
 * Create a review
 * POST /api/reviews
 */
export const createReview = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await reviewService.createReview(
    req.userId,
    req.body,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

/**
 * Get reviews for a guide
 * GET /api/reviews/guide/:guideId
 */
export const getGuideReviews = asyncHandler(async (req, res) => {
  const { guideId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  const result = await reviewService.getGuideReviews(guideId, options);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
});

/**
 * Get reviews by current tourist
 * GET /api/reviews/my-reviews
 */
export const getMyReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
  };

  const reviews = await reviewService.getTouristReviews(req.userId, options);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: reviews,
  });
});

/**
 * Get review for a specific trip
 * GET /api/reviews/trip/:tripId
 */
export const getTripReview = asyncHandler(async (req, res) => {
  const { tripId } = req.params;

  const review = await reviewService.getReviewByTrip(tripId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: review,
  });
});

/**
 * Update a review
 * PUT /api/reviews/:reviewId
 */
export const updateReview = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await reviewService.updateReview(
    req.userId,
    req.params.reviewId,
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
 * Delete a review
 * DELETE /api/reviews/:reviewId
 */
export const deleteReview = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await reviewService.deleteReview(
    req.userId,
    req.params.reviewId,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Add guide response to review
 * POST /api/reviews/:reviewId/response
 */
export const addGuideResponse = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);
  const { text } = req.body;

  const result = await reviewService.addGuideResponse(
    req.userId,
    req.params.reviewId,
    text,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Mark review as helpful
 * POST /api/reviews/:reviewId/helpful
 */
export const markHelpful = asyncHandler(async (req, res) => {
  const result = await reviewService.markHelpful(req.params.reviewId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Get review statistics for a guide
 * GET /api/reviews/guide/:guideId/stats
 */
export const getGuideReviewStats = asyncHandler(async (req, res) => {
  const stats = await reviewService.getGuideReviewStats(req.params.guideId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: stats,
  });
});

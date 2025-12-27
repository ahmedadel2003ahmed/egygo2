import express from "express";
import * as reviewController from "../controllers/reviewController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { requireGuide } from "../middlewares/roleMiddleware.js";

const router = express.Router();

/**
 * Review Routes - /api/reviews
 */

// Public routes (no authentication required)
router.get("/guide/:guideId", reviewController.getGuideReviews);
router.get("/guide/:guideId/stats", reviewController.getGuideReviewStats);

// Protected routes (authentication required)
// Tourist routes - create and manage reviews
router.post("/", authenticate, reviewController.createReview);
router.get("/my-reviews", authenticate, reviewController.getMyReviews);
router.put("/:reviewId", authenticate, reviewController.updateReview);
router.delete("/:reviewId", authenticate, reviewController.deleteReview);
router.post("/:reviewId/helpful", authenticate, reviewController.markHelpful);

// Guide routes - respond to reviews
router.post(
  "/:reviewId/response",
  authenticate,
  requireGuide,
  reviewController.addGuideResponse
);

// Trip review can be accessed by authenticated users
router.get("/trip/:tripId", authenticate, reviewController.getTripReview);

export default router;

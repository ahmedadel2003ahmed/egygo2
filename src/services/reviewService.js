import reviewRepository from "../repositories/reviewRepository.js";
import guideRepository from "../repositories/guideRepository.js";
import tripRepository from "../repositories/tripRepository.js";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  AUDIT_ACTIONS,
} from "../utils/constants.js";
import { logAudit } from "../utils/auditLogger.js";

/**
 * Review Service - Business logic for review operations
 */
class ReviewService {
  /**
   * Create a review
   */
  async createReview(userId, reviewData, ipAddress, userAgent) {
    const { tripId, guideId, rating, comment, aspects } = reviewData;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    // Check if trip exists
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error("Trip not found");
    }

    // Verify tourist is the trip owner
    if (trip.tourist.toString() !== userId) {
      throw new Error("You can only review trips you participated in");
    }

    // Verify trip is completed
    if (trip.status !== "completed") {
      throw new Error("You can only review completed trips");
    }

    // Check if guide exists
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    // Check if already reviewed
    const existingReview = await reviewRepository.hasReviewed(tripId, userId);
    if (existingReview) {
      throw new Error("You have already reviewed this trip");
    }

    // Create review
    const review = await reviewRepository.create({
      guide: guideId,
      tourist: userId,
      trip: tripId,
      rating,
      comment,
      aspects: aspects || {},
      isVerified: true, // Auto-verify since it's from a completed trip
    });

    // Update guide's rating
    await this.updateGuideRating(guideId);

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.CREATE,
      resourceType: "review",
      resourceId: review._id,
      details: { guideId, tripId, rating },
      ipAddress,
      userAgent,
    });

    return {
      message: SUCCESS_MESSAGES.REVIEW_CREATED || "Review created successfully",
      data: review,
    };
  }

  /**
   * Get reviews for a guide
   */
  async getGuideReviews(guideId, options = {}) {
    const reviews = await reviewRepository.findByGuideId(guideId, options);
    const totalReviews = await reviewRepository.countByGuideId(guideId);
    const stats = await reviewRepository.getGuideStats(guideId);
    const ratingData = await reviewRepository.calculateGuideRating(guideId);

    return {
      reviews,
      totalReviews,
      stats,
      ratingData,
      pagination: {
        skip: options.skip || 0,
        limit: options.limit || 20,
        total: totalReviews,
      },
    };
  }

  /**
   * Get reviews by tourist
   */
  async getTouristReviews(touristId, options = {}) {
    const reviews = await reviewRepository.findByTouristId(touristId, options);
    return reviews;
  }

  /**
   * Get review by trip
   */
  async getReviewByTrip(tripId) {
    const review = await reviewRepository.findByTripId(tripId);
    return review;
  }

  /**
   * Update review
   */
  async updateReview(userId, reviewId, updateData, ipAddress, userAgent) {
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }

    // Verify ownership
    if (review.tourist.toString() !== userId) {
      throw new Error("You can only update your own reviews");
    }

    // Only allow updating rating, comment, and aspects
    const allowedUpdates = {};
    if (updateData.rating) {
      if (updateData.rating < 1 || updateData.rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }
      allowedUpdates.rating = updateData.rating;
    }
    if (updateData.comment !== undefined)
      allowedUpdates.comment = updateData.comment;
    if (updateData.aspects) allowedUpdates.aspects = updateData.aspects;

    const updatedReview = await reviewRepository.update(
      reviewId,
      allowedUpdates
    );

    // Update guide's rating if rating changed
    if (updateData.rating) {
      await this.updateGuideRating(review.guide);
    }

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.UPDATE,
      resourceType: "review",
      resourceId: reviewId,
      details: { updates: Object.keys(allowedUpdates) },
      ipAddress,
      userAgent,
    });

    return {
      message: "Review updated successfully",
      data: updatedReview,
    };
  }

  /**
   * Delete review
   */
  async deleteReview(userId, reviewId, ipAddress, userAgent) {
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }

    // Verify ownership
    if (review.tourist.toString() !== userId) {
      throw new Error("You can only delete your own reviews");
    }

    const guideId = review.guide;
    await reviewRepository.delete(reviewId);

    // Update guide's rating
    await this.updateGuideRating(guideId);

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.DELETE,
      resourceType: "review",
      resourceId: reviewId,
      details: { guideId },
      ipAddress,
      userAgent,
    });

    return {
      message: "Review deleted successfully",
    };
  }

  /**
   * Add guide response to review
   */
  async addGuideResponse(userId, reviewId, responseText, ipAddress, userAgent) {
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }

    // Get guide profile
    const guide = await guideRepository.findByUserId(userId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    // Verify the review is for this guide
    if (review.guide.toString() !== guide._id.toString()) {
      throw new Error("You can only respond to reviews for your profile");
    }

    if (!responseText || responseText.trim().length === 0) {
      throw new Error("Response text is required");
    }

    const updatedReview = await reviewRepository.addResponse(
      reviewId,
      responseText
    );

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.UPDATE,
      resourceType: "review",
      resourceId: reviewId,
      details: { action: "add_response" },
      ipAddress,
      userAgent,
    });

    return {
      message: "Response added successfully",
      data: updatedReview,
    };
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(reviewId) {
    const review = await reviewRepository.incrementHelpful(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }

    return {
      message: "Marked as helpful",
      data: review,
    };
  }

  /**
   * Update guide's overall rating
   */
  async updateGuideRating(guideId) {
    const ratingData = await reviewRepository.calculateGuideRating(guideId);

    await guideRepository.findByIdAndUpdate(guideId, {
      rating: ratingData.averageRating,
      ratingCount: ratingData.totalReviews,
    });

    return ratingData;
  }

  /**
   * Get review statistics for a guide
   */
  async getGuideReviewStats(guideId) {
    const stats = await reviewRepository.getGuideStats(guideId);
    const ratingData = await reviewRepository.calculateGuideRating(guideId);

    return {
      ...stats,
      ...ratingData,
    };
  }
}

export default new ReviewService();

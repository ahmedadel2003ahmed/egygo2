import Review from "../models/Review.js";

/**
 * Review Repository - Data access for reviews
 */
class ReviewRepository {
  /**
   * Create a new review
   */
  async create(reviewData) {
    const review = new Review(reviewData);
    return await review.save();
  }

  /**
   * Find review by ID
   */
  async findById(reviewId) {
    return await Review.findById(reviewId)
      .populate("tourist", "name avatar")
      .populate("guide", "name user")
      .populate("trip", "startAt");
  }

  /**
   * Find reviews for a guide
   */
  async findByGuideId(guideId, options = {}) {
    const { skip = 0, limit = 20, includeHidden = false } = options;

    const query = { guide: guideId };
    if (!includeHidden) {
      query.isHidden = false;
    }

    return await Review.find(query)
      .populate("tourist", "name avatar")
      .populate("trip", "startAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  /**
   * Count reviews for a guide
   */
  async countByGuideId(guideId, includeHidden = false) {
    const query = { guide: guideId };
    if (!includeHidden) {
      query.isHidden = false;
    }
    return await Review.countDocuments(query);
  }

  /**
   * Find reviews by tourist
   */
  async findByTouristId(touristId, options = {}) {
    const { skip = 0, limit = 20 } = options;

    return await Review.find({ tourist: touristId })
      .populate("guide", "name user avatar")
      .populate("trip", "startAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  /**
   * Find review by trip ID
   */
  async findByTripId(tripId) {
    return await Review.findOne({ trip: tripId })
      .populate("tourist", "name avatar")
      .populate("guide", "name user");
  }

  /**
   * Check if tourist has reviewed a trip
   */
  async hasReviewed(tripId, touristId) {
    const review = await Review.findOne({ trip: tripId, tourist: touristId });
    return !!review;
  }

  /**
   * Update review
   */
  async update(reviewId, updateData) {
    return await Review.findByIdAndUpdate(
      reviewId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("tourist", "name avatar")
      .populate("guide", "name user");
  }

  /**
   * Delete review
   */
  async delete(reviewId) {
    return await Review.findByIdAndDelete(reviewId);
  }

  /**
   * Add guide response
   */
  async addResponse(reviewId, responseText) {
    return await Review.findByIdAndUpdate(
      reviewId,
      {
        $set: {
          "response.text": responseText,
          "response.respondedAt": new Date(),
        },
      },
      { new: true }
    )
      .populate("tourist", "name avatar")
      .populate("guide", "name user");
  }

  /**
   * Increment helpful count
   */
  async incrementHelpful(reviewId) {
    return await Review.findByIdAndUpdate(
      reviewId,
      { $inc: { helpfulCount: 1 } },
      { new: true }
    );
  }

  /**
   * Calculate average rating for a guide
   */
  async calculateGuideRating(guideId) {
    const result = await Review.aggregate([
      { $match: { guide: guideId, isHidden: false } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating",
          },
        },
      },
    ]);

    if (result.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    // Calculate distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    result[0].ratingDistribution.forEach((rating) => {
      distribution[rating] = (distribution[rating] || 0) + 1;
    });

    return {
      averageRating: Math.round(result[0].averageRating * 10) / 10,
      totalReviews: result[0].totalReviews,
      distribution,
    };
  }

  /**
   * Get review statistics for a guide
   */
  async getGuideStats(guideId) {
    const result = await Review.aggregate([
      { $match: { guide: guideId, isHidden: false } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          averageCommunication: { $avg: "$aspects.communication" },
          averageKnowledge: { $avg: "$aspects.knowledge" },
          averageProfessionalism: { $avg: "$aspects.professionalism" },
          averageFriendliness: { $avg: "$aspects.friendliness" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }
}

export default new ReviewRepository();

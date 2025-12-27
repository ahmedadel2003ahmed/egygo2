import mongoose from "mongoose";
import Guide from "../models/Guide.js";

/**
 * Guide Repository - Direct Mongoose queries
 */
class GuideRepository {
  async create(guideData) {
    return await Guide.create(guideData);
  }

  async findById(guideId) {
    try {
      return await Guide.findById(guideId).populate("user", "-password");
    } catch (error) {
      console.error("Error in guideRepository.findById:", error);
      if (error.name === "CastError") {
        console.error("CastError details:", {
          path: error.path,
          value: error.value,
        });
        return null;
      }
      throw error;
    }
  }

  async findByUserId(userId) {
    console.log("findByUserId called with:", { userId, type: typeof userId });

    // If a full user object was accidentally passed, extract its _id
    if (userId && typeof userId === "object") {
      if (userId._id) {
        userId = userId._id;
      }
    }

    // Validate ID to avoid CastError
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log("findByUserId: Invalid userId format, returning null");
      return null;
    }

    try {
      return await Guide.findOne({ user: userId })
        .populate("user", "-password")
        .populate("province", "name slug")
        .populate("provinces", "name slug");
    } catch (error) {
      console.error("Error in guideRepository.findByUserId:", error);
      if (error.name === "CastError") {
        console.error("CastError details:", {
          path: error.path,
          value: error.value,
        });
        return null;
      }
      throw error;
    }
  }

  async findByIdAndUpdate(guideId, updateData) {
    return await Guide.findByIdAndUpdate(guideId, updateData, {
      new: true,
      runValidators: true,
    }).populate("user", "-password");
  }

  async findAll(filter = {}, options = {}) {
    const { skip = 0, limit = 20, sort = { createdAt: -1 } } = options;

    return await Guide.find(filter)
      .populate("user", "name email avatar")
      .populate("province", "name slug")
      .populate("provinces", "name slug")
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  async search(filters, options = {}) {
    const query = {};

    if (filters.languages && filters.languages.length > 0) {
      query.languages = { $in: filters.languages };
    }

    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      query.pricePerHour = {};
      if (filters.priceMin !== undefined)
        query.pricePerHour.$gte = filters.priceMin;
      if (filters.priceMax !== undefined)
        query.pricePerHour.$lte = filters.priceMax;
    }

    if (filters.isVerified !== undefined) {
      query.isVerified = filters.isVerified;
    }

    return await this.findAll(query, options);
  }

  async addDocument(guideId, documentData) {
    return await Guide.findByIdAndUpdate(
      guideId,
      { $push: { documents: documentData } },
      { new: true }
    ).populate("user", "-password");
  }

  async updateDocument(guideId, documentId, updateData) {
    return await Guide.findOneAndUpdate(
      { _id: guideId, "documents._id": documentId },
      { $set: { "documents.$": { ...updateData, _id: documentId } } },
      { new: true }
    ).populate("user", "-password");
  }

  async removeDocument(guideId, documentId) {
    return await Guide.findByIdAndUpdate(
      guideId,
      { $pull: { documents: { _id: documentId } } },
      { new: true }
    ).populate("user", "-password");
  }

  async getDocument(guideId, documentId) {
    const guide = await Guide.findById(guideId);
    if (!guide) return null;

    return guide.documents.id(documentId);
  }

  async incrementTotalTrips(guideId) {
    return await Guide.findByIdAndUpdate(
      guideId,
      { $inc: { totalTrips: 1 } },
      { new: true }
    );
  }

  async countDocuments(filter = {}) {
    return await Guide.countDocuments(filter);
  }

  /**
   * Find guides by province with filters
   */
  async findByProvince(provinceId, filters = {}, options = {}) {
    const query = {
      $or: [{ province: provinceId }, { provinces: provinceId }],
    };

    if (filters.language) {
      query.languages = filters.language;
    }

    if (filters.maxPrice !== undefined) {
      query.pricePerHour = { $lte: filters.maxPrice };
    }

    if (filters.verified !== undefined) {
      query.isVerified = filters.verified;
    }

    return await this.findAll(query, options);
  }

  /**
   * Search guides near a location
   */
  async searchNear(coords, maxDistance, filters = {}, options = {}) {
    const { skip = 0, limit = 20, sort = {} } = options;
    const query = {
      location: {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: coords, // [lng, lat]
          },
          $maxDistance: maxDistance,
        },
      },
    };

    if (filters.language) {
      query.languages = filters.language;
    }

    if (filters.maxPrice !== undefined) {
      query.pricePerHour = { $lte: filters.maxPrice };
    }

    if (filters.verified !== undefined) {
      query.isVerified = filters.verified;
    }

    return await Guide.find(query)
      .populate("user", "name email avatar")
      .populate("province", "name slug")
      .skip(skip)
      .limit(limit);
  }

  /**
   * Upsert guide by user ID (idempotent)
   */
  async upsertByUserId(userId, guideData) {
    try {
      return await Guide.findOneAndUpdate(
        { user: userId },
        { $set: guideData },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      )
        .populate("user", "name email avatar")
        .populate("province", "name slug")
        .populate("provinces", "name slug");
    } catch (error) {
      console.error("Error in guideRepository.upsertByUserId:", error);
      throw error;
    }
  }

  /**
   * Find guide by slug
   */
  async findBySlug(slug) {
    return await Guide.findOne({ slug })
      .populate("user", "name email avatar")
      .populate("province", "name slug");
  }

  /**
   * Add gallery images to guide
   */
  async addGalleryImages(guideId, images) {
    return await Guide.findByIdAndUpdate(
      guideId,
      { $push: { gallery: { $each: images } } },
      { new: true, runValidators: true }
    ).populate("user", "-password");
  }

  /**
   * Remove gallery image from guide
   */
  async removeGalleryImage(guideId, imageId) {
    return await Guide.findByIdAndUpdate(
      guideId,
      { $pull: { gallery: { _id: imageId } } },
      { new: true }
    ).populate("user", "-password");
  }
}

export default new GuideRepository();

import Attraction from "../models/Attraction.js";

/**
 * Attraction Repository - Direct Mongoose queries
 */
class AttractionRepository {
  async create(attractionData) {
    return await Attraction.create(attractionData);
  }

  async findById(attractionId) {
    return await Attraction.findById(attractionId);
  }

  async findByIdAndUpdate(attractionId, updateData) {
    return await Attraction.findByIdAndUpdate(attractionId, updateData, {
      new: true,
      runValidators: true,
    });
  }

  async findAll(filter = {}, options = {}) {
    const { skip = 0, limit = 20, sort = { createdAt: -1 } } = options;

    return await Attraction.find(filter).sort(sort).skip(skip).limit(limit);
  }

  async searchByCity(city, options = {}) {
    return await this.findAll(
      { "location.city": { $regex: city, $options: "i" }, isActive: true },
      options
    );
  }

  async findNearby(
    longitude,
    latitude,
    maxDistanceMeters = 50010,
    options = {}
  ) {
    const { skip = 0, limit = 20 } = options;

    return await Attraction.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          $maxDistance: maxDistanceMeters,
        },
      },
      isActive: true,
    })
      .skip(skip)
      .limit(limit);
  }

  async delete(attractionId) {
    return await Attraction.findByIdAndDelete(attractionId);
  }

  async countDocuments(filter = {}) {
    return await Attraction.countDocuments(filter);
  }
}

export default new AttractionRepository();

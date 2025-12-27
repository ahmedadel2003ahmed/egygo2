import Trip from "../models/Trip.js";

/**
 * Trip Repository - Thin wrapper over Mongoose for Trip model
 * Provides direct database access methods
 */
class TripRepository {
  /**
   * Create a new trip
   * @param {Object} tripData - Trip data to create
   * @returns {Promise<Object>} Created trip document
   */
  async create(tripData) {
    return await Trip.create(tripData);
  }

  /**
   * Find trip by ID with populated references
   * @param {String} tripId - Trip ID
   * @returns {Promise<Object|null>} Trip document or null
   */
  async findById(tripId) {
    try {
      return await Trip.findById(tripId)
        .populate({
          path: "tourist",
          select: "name email phone avatar",
          options: { strictPopulate: false },
        })
        .populate({
          path: "selectedGuide",
          populate: {
            path: "user",
            select: "name email phone avatar",
            options: { strictPopulate: false },
          },
          options: { strictPopulate: false },
        })
        .populate({
          path: "guide",
          populate: {
            path: "user",
            select: "name email phone avatar",
            options: { strictPopulate: false },
          },
          options: { strictPopulate: false },
        })
        .populate({
          path: "itinerary.place",
          select: "name location ticketPrice",
          options: { strictPopulate: false },
        })
        .lean();
    } catch (error) {
      console.error("Error in tripRepository.findById:", error);
      // If it's a cast error, the ID format is invalid
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

  /**
   * Find trip by ID and update
   * @param {String} tripId - Trip ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated trip document
   */
  async updateById(tripId, updateData) {
    return await Trip.findByIdAndUpdate(tripId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("tourist", "name email phone avatar")
      .populate({
        path: "guide",
        populate: { path: "user", select: "name email phone avatar" },
      })
      .populate("itinerary.place", "name location ticketPrice");
  }

  /**
   * Find trips by filter with options
   * @param {Object} filter - MongoDB filter object
   * @param {Object} options - Query options (skip, limit, sort)
   * @returns {Promise<Array>} Array of trip documents
   */
  async findByFilter(filter = {}, options = {}) {
    const { skip = 0, limit = 20, sort = { createdAt: -1 } } = options;

    return await Trip.find(filter)
      .populate("tourist", "name email phone avatar")
      .populate({
        path: "guide",
        populate: { path: "user", select: "name email phone avatar" },
      })
      .populate("itinerary.place", "name location ticketPrice")
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  /**
   * Find overlapping trips for a guide within a time window
   * Used to check guide availability
   * @param {String} guideId - Guide ID
   * @param {Date} startAt - Trip start time
   * @param {Date} endAt - Trip end time
   * @param {Array<String>} statuses - Trip statuses to check (default: confirmed, in_progress)
   * @returns {Promise<Array>} Array of overlapping trips
   */
  async findOverlappingTrips(
    guideId,
    startAt,
    endAt,
    statuses = ["confirmed", "in_progress"]
  ) {
    return await Trip.find({
      guide: guideId,
      status: { $in: statuses },
      $or: [
        // Existing trip starts before new trip ends AND ends after new trip starts
        {
          startAt: { $lt: endAt },
          endAt: { $gt: startAt },
        },
      ],
    });
  }

  /**
   * Find trips by tourist
   * @param {String} touristId - Tourist user ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of trips
   */
  async findByTourist(touristId, options = {}) {
    return await this.findByFilter({ tourist: touristId }, options);
  }

  /**
   * Find trips by guide
   * @param {String} guideId - Guide ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of trips
   */
  async findByGuide(guideId, options = {}) {
    return await this.findByFilter({ guide: guideId }, options);
  }

  /**
   * Count trips matching filter
   * @param {Object} filter - MongoDB filter object
   * @returns {Promise<Number>} Count of matching documents
   */
  async countDocuments(filter = {}) {
    return await Trip.countDocuments(filter);
  }

  /**
   * Find completed trips with reviews for a guide
   * @param {String} guideId - Guide ID
   * @returns {Promise<Array>} Array of completed trips with reviews
   */
  async findCompletedTripsWithReviews(guideId) {
    return await Trip.find({
      guide: guideId,
      status: "completed",
      "review.rating": { $exists: true, $ne: null },
    });
  }

  /**
   * Find all trips (with filter and options)
   * @param {Object} filter - MongoDB filter
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of trips
   */
  async findAll(filter = {}, options = {}) {
    return await this.findByFilter(filter, options);
  }

  /**
   * Find trip by callId
   * @param {String} callId - Call session ID
   * @returns {Promise<Object|null>} Trip document or null
   */
  async findByCallId(callId) {
    return await Trip.findOne({ callId })
      .populate("tourist", "name email phone avatar")
      .populate({
        path: "guide",
        populate: { path: "user", select: "name email phone avatar" },
      })
      .populate("itinerary.place", "name location ticketPrice");
  }

  /**
   * Find existing trip to prevent duplicates
   * Used for deduplication based on callId, tourist, and startAt
   * @param {String} callId - Call session ID
   * @param {String} touristId - Tourist user ID
   * @param {Date} startAt - Trip start time
   * @returns {Promise<Object|null>} Existing trip or null
   */
  async findDuplicate(callId, touristId, startAt) {
    if (!callId) return null;

    const query = {
      callId,
      tourist: touristId,
    };

    // If startAt provided, match within same day
    if (startAt) {
      const startDate = new Date(startAt);
      const dayStart = new Date(startDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(startDate);
      dayEnd.setHours(23, 59, 59, 999);

      query.startAt = {
        $gte: dayStart,
        $lte: dayEnd,
      };
    }

    return await Trip.findOne(query);
  }

  /**
   * Find one trip matching filter
   * @param {Object} filter - MongoDB filter object
   * @returns {Promise<Object|null>} Trip document or null
   */
  async findOne(filter) {
    return await Trip.findOne(filter)
      .populate("tourist", "name email phone avatar")
      .populate({
        path: "guide",
        populate: { path: "user", select: "name email phone avatar" },
      })
      .populate("itinerary.place", "name location ticketPrice");
  }

  /**
   * Update trip by ID with new data
   * Alias for updateById for backward compatibility
   * @param {String} tripId - Trip ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated trip document
   */
  async findByIdAndUpdate(tripId, updateData, options = {}) {
    const defaultOptions = {
      new: true,
      runValidators: true,
      ...options,
    };

    return await Trip.findByIdAndUpdate(tripId, updateData, defaultOptions)
      .populate("tourist", "name email phone avatar")
      .populate({
        path: "guide",
        populate: { path: "user", select: "name email phone avatar" },
      })
      .populate("itinerary.place", "name location ticketPrice");
  }

  /**
   * Update one trip matching filter
   * @param {Object} filter - MongoDB filter object
   * @param {Object} updateData - Data to update
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Mongoose update result
   */
  async updateOne(filter, updateData, options = {}) {
    return await Trip.updateOne(filter, updateData, options);
  }

  /**
   * Save a trip document
   * @param {Object} trip - Trip document to save
   * @returns {Promise<Object>} Saved trip document
   */
  async save(trip) {
    return await trip.save();
  }

  /**
   * Compatibility update method - flexible signature
   * Supports both (id, updateData) and (filter, updateData) patterns
   *
   * @param {String|Object} idOrFilter - Trip ID (string/ObjectId) or filter object
   * @param {Object} updateData - Data to update
   * @param {Object} options - Optional update options
   * @returns {Promise<Object>} Updated trip document or update result
   *
   * @example
   * // Update by ID
   * await tripRepository.update('123abc', { status: 'confirmed' })
   *
   * @example
   * // Update by filter
   * await tripRepository.update({ tourist: userId }, { status: 'cancelled' })
   */
  async update(idOrFilter, updateData, options = {}) {
    try {
      // Normalize updateData to use $set if not already using operators
      const hasOperators = Object.keys(updateData).some((key) =>
        key.startsWith("$")
      );
      const normalizedUpdate = hasOperators ? updateData : { $set: updateData };

      // Determine if first argument is an ID or filter object
      const isId =
        typeof idOrFilter === "string" ||
        (idOrFilter &&
          idOrFilter.constructor &&
          idOrFilter.constructor.name === "ObjectId");

      if (isId) {
        // Update by ID - return full document
        const defaultOptions = {
          new: true,
          runValidators: true,
          ...options,
        };

        return await Trip.findByIdAndUpdate(
          idOrFilter,
          normalizedUpdate,
          defaultOptions
        )
          .populate("tourist", "name email phone avatar")
          .populate({
            path: "guide",
            populate: { path: "user", select: "name email phone avatar" },
          })
          .populate("itinerary.place", "name location ticketPrice");
      } else {
        // Update by filter - return update result
        return await Trip.updateOne(idOrFilter, normalizedUpdate, options);
      }
    } catch (error) {
      console.error("[TripRepository.update] Error:", {
        idOrFilter: typeof idOrFilter === "object" ? "{filter}" : idOrFilter,
        error: error.message,
      });
      throw error;
    }
  }
}

export default new TripRepository();

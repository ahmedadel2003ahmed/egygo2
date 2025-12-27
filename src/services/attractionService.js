import attractionRepository from '../repositories/attractionRepository.js';
import guideRepository from '../repositories/guideRepository.js';
import tripService from './tripService.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

const DEFAULT_PLACE_VISIT_MINUTES = parseInt(process.env.DEFAULT_PLACE_VISIT_MINUTES || '120');

/**
 * Attraction Service - Business logic for attraction operations
 */
class AttractionService {
  /**
   * Create attraction (admin only)
   */
  async createAttraction(attractionData) {
    const { name, description, location, images, openingHours, ticketPrice, category } = attractionData;

    // Prepare location data
    const locationData = {
      type: 'Point',
      coordinates: location.coordinates, // [longitude, latitude]
      address: location.address,
      city: location.city,
    };

    // Create attraction
    const attraction = await attractionRepository.create({
      name,
      description,
      location: locationData,
      images: images || [],
      openingHours,
      ticketPrice,
      category,
      isActive: true,
    });

    return {
      message: 'Attraction created successfully',
      attraction,
    };
  }

  /**
   * Get attraction by ID
   */
  async getAttractionById(attractionId) {
    const attraction = await attractionRepository.findById(attractionId);
    if (!attraction) {
      throw new Error(ERROR_MESSAGES.ATTRACTION_NOT_FOUND);
    }

    return attraction;
  }

  /**
   * Get all attractions
   */
  async getAllAttractions(options) {
    return await attractionRepository.findAll({ isActive: true }, options);
  }

  /**
   * Search attractions by city
   */
  async searchByCity(city, options) {
    return await attractionRepository.searchByCity(city, options);
  }

  /**
   * Find nearby attractions
   */
  async findNearbyAttractions(longitude, latitude, maxDistanceMeters, options) {
    return await attractionRepository.findNearby(longitude, latitude, maxDistanceMeters, options);
  }

  /**
   * Update attraction (admin only)
   */
  async updateAttraction(attractionId, updateData) {
    const attraction = await attractionRepository.findByIdAndUpdate(attractionId, updateData);
    if (!attraction) {
      throw new Error(ERROR_MESSAGES.ATTRACTION_NOT_FOUND);
    }

    return {
      message: 'Attraction updated successfully',
      attraction,
    };
  }

  /**
   * Delete attraction (admin only - soft delete)
   */
  async deleteAttraction(attractionId) {
    const attraction = await attractionRepository.findByIdAndUpdate(attractionId, { isActive: false });
    if (!attraction) {
      throw new Error(ERROR_MESSAGES.ATTRACTION_NOT_FOUND);
    }

    return {
      message: 'Attraction deleted successfully',
    };
  }

  /**
   * Book trip from place/attraction page
   * Convenience method that pre-fills meeting point and creates trip via TripService
   * @param {String} attractionId - Attraction/Place ID
   * @param {String} touristId - Tourist user ID
   * @param {Object} bookingData - { itinerary, startAt, guideId, notes }
   * @returns {Promise<Object>} Created trip
   */
  async bookFromPlace(attractionId, touristId, bookingData) {
    const { itinerary, startAt, guideId, notes } = bookingData;

    // Fetch attraction
    const attraction = await attractionRepository.findById(attractionId);
    if (!attraction) {
      const error = new Error(ERROR_MESSAGES.ATTRACTION_NOT_FOUND || 'Attraction not found');
      error.status = 404;
      throw error;
    }

    // Validate guide if provided
    if (guideId) {
      const guide = await guideRepository.findById(guideId);
      if (!guide) {
        const error = new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND || 'Guide not found');
        error.status = 404;
        throw error;
      }

      // Check if guide is verified
      if (!guide.isVerified) {
        const error = new Error('Selected guide is not verified. Please choose a verified guide.');
        error.status = 400;
        throw error;
      }
    }

    // Build itinerary - use provided or create default from this attraction
    const tripItinerary = itinerary && itinerary.length > 0
      ? itinerary
      : [
          {
            placeId: attractionId,
            visitDurationMinutes: DEFAULT_PLACE_VISIT_MINUTES,
            ticketRequired: attraction.ticketPrice && attraction.ticketPrice > 0,
            notes: notes || '',
          },
        ];

    // Pre-fill meeting point from attraction location
    const meetingPoint = attraction.location?.coordinates
      ? {
          coordinates: attraction.location.coordinates, // [longitude, latitude]
        }
      : undefined;

    const meetingAddress = attraction.location?.address || attraction.name;

    // Build trip payload
    const tripPayload = {
      touristId,
      guideId,
      itinerary: tripItinerary,
      startAt,
      meetingPoint,
      meetingAddress,
      createdFromPlaceId: attractionId,
      notes,
    };

    // Call TripService as single source of truth
    const trip = await tripService.createTrip(tripPayload);

    return {
      success: true,
      message: 'Trip booked successfully from attraction',
      trip,
      attraction: {
        _id: attraction._id,
        name: attraction.name,
        location: attraction.location,
      },
    };
  }
}

export default new AttractionService();

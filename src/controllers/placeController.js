/**
 * Place Controller
 * Handles HTTP requests for place endpoints
 */

import * as placeService from "../services/placeService.js";

/**
 * Get all places with pagination
 * @route GET /api/places
 */
const getAllPlaces = async (req, res, next) => {
  try {
    const { page, limit, sort } = req.query;

    const result = await placeService.getAllPlaces({
      page,
      limit,
      sort,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get place by ID
 * @route GET /api/places/:id
 */
const getPlaceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Place ID is required",
      });
    }

    const result = await placeService.getPlaceById(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get places by province
 * @route GET /api/provinces/:slug/places
 */
const getPlacesByProvince = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { type, near, radius, page, limit, sort } = req.query;

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Province slug is required",
      });
    }

    // Validate type if provided
    if (
      type &&
      !["archaeological", "entertainment", "hotels", "events"].includes(type)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid place type. Must be one of: archaeological, entertainment, hotels, events",
      });
    }

    const result = await placeService.getPlacesByProvince(slug, {
      type,
      near,
      radius,
      page,
      limit,
      sort,
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Search places
 * @route GET /api/places/search?q=term&type=archaeological
 */
const searchPlaces = async (req, res, next) => {
  try {
    const { q, type, limit } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search term is required",
      });
    }

    const result = await placeService.searchPlaces(q, {
      type,
      limit,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get places near coordinates
 * @route GET /api/places/near?lat=30.0444&lng=31.2357&radius=5001
 */
const getPlacesNear = async (req, res, next) => {
  try {
    const { lat, lng, radius, type, limit } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates",
      });
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Coordinates out of range",
      });
    }

    const result = await placeService.getPlacesNear(longitude, latitude, {
      radius,
      type,
      limit,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export {
  getAllPlaces,
  getPlaceById,
  getPlacesByProvince,
  searchPlaces,
  getPlacesNear,
};

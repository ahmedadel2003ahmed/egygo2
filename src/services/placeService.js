/**
 * Place Service
 * Business logic layer for places
 */

import * as placeRepository from '../repositories/placeRepository.js';
import * as provinceRepository from '../repositories/provinceRepository.js';

/**
 * Get all places with pagination
 * @param {Object} options - Query options
 * @returns {Promise<{success: boolean, data: Object}>}
 */
const getAllPlaces = async (options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt' } = options;
  const skip = (page - 1) * limit;
  
  const { places, total } = await placeRepository.findAll({
    limit: parseInt(limit),
    skip,
    sort
  });
  
  return {
    success: true,
    data: {
      places,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  };
};

/**
 * Get place by ID
 * @param {string} id - Place ID
 * @returns {Promise<{success: boolean, data: Place, message?: string}>}
 */
const getPlaceById = async (id) => {
  const place = await placeRepository.findById(id);
  
  if (!place) {
    return {
      success: false,
      message: 'Place not found'
    };
  }
  
  // Increment view count asynchronously
  placeRepository.incrementViews(id).catch(err => {
    console.error('Failed to increment view count:', err);
  });
  
  return {
    success: true,
    data: place
  };
};

/**
 * Get place by slug
 * @param {string} slug - Place slug
 * @returns {Promise<{success: boolean, data: Place, message?: string}>}
 */
const getPlaceBySlug = async (slug) => {
  const place = await placeRepository.findBySlug(slug);
  
  if (!place) {
    return {
      success: false,
      message: 'Place not found'
    };
  }
  
  return {
    success: true,
    data: place
  };
};

/**
 * Get places by province
 * @param {string} provinceSlug - Province slug
 * @param {Object} options - Query options
 * @returns {Promise<{success: boolean, data: Object, message?: string}>}
 */
const getPlacesByProvince = async (provinceSlug, options = {}) => {
  const province = await provinceRepository.findBySlug(provinceSlug);
  
  if (!province) {
    return {
      success: false,
      message: 'Province not found'
    };
  }
  
  const { type, near, radius = 10000, page = 1, limit = 20, sort = '-rating -viewsCount' } = options;
  
  // If near coordinates are provided, use geospatial query
  if (near) {
    const [lat, lng] = near.split(',').map(parseFloat);
    
    if (isNaN(lat) || isNaN(lng)) {
      return {
        success: false,
        message: 'Invalid coordinates format. Use: lat,lng'
      };
    }
    
    const places = await placeRepository.findNear(lng, lat, {
      radius: parseInt(radius),
      type,
      limit: parseInt(limit)
    });
    
    return {
      success: true,
      data: {
        province: {
          name: province.name,
          slug: province.slug
        },
        places,
        total: places.length
      }
    };
  }
  
  // Regular query by province
  const skip = (page - 1) * limit;
  const { places, total } = await placeRepository.findByProvince(province._id, {
    type,
    limit: parseInt(limit),
    skip,
    sort
  });
  
  return {
    success: true,
    data: {
      province: {
        name: province.name,
        slug: province.slug
      },
      places,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  };
};

/**
 * Search places
 * @param {string} searchTerm - Search term
 * @param {Object} options - Query options
 * @returns {Promise<{success: boolean, data: Place[]}>}
 */
const searchPlaces = async (searchTerm, options = {}) => {
  const { type, limit = 20 } = options;
  
  const places = await placeRepository.search(searchTerm, {
    type,
    limit: parseInt(limit)
  });
  
  return {
    success: true,
    data: places
  };
};

/**
 * Get places near coordinates
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {Object} options - Query options
 * @returns {Promise<{success: boolean, data: Place[]}>}
 */
const getPlacesNear = async (lng, lat, options = {}) => {
  const { radius = 10000, type, limit = 50 } = options;
  
  const places = await placeRepository.findNear(lng, lat, {
    radius: parseInt(radius),
    type,
    limit: parseInt(limit)
  });
  
  return {
    success: true,
    data: places
  };
};

export {
  getAllPlaces,
  getPlaceById,
  getPlaceBySlug,
  getPlacesByProvince,
  searchPlaces,
  getPlacesNear
};

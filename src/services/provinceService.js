/**
 * Province Service
 * Business logic layer for provinces
 */

import * as provinceRepository from '../repositories/provinceRepository.js';
import * as placeRepository from '../repositories/placeRepository.js';

/**
 * Get all provinces
 * @returns {Promise<{success: boolean, data: Province[]}>}
 */
const getAllProvinces = async () => {
  const provinces = await provinceRepository.findAll();
  
  return {
    success: true,
    data: provinces
  };
};

/**
 * Get province by slug with sections
 * @param {string} slug - Province slug
 * @returns {Promise<{success: boolean, data: Object, message?: string}>}
 */
const getProvinceBySlug = async (slug) => {
  const province = await provinceRepository.findBySlug(slug);
  
  if (!province) {
    return {
      success: false,
      message: `Province '${slug}' not found`
    };
  }
  
  // Get places grouped by type
  const sections = await placeRepository.findByProvinceGrouped(province._id);
  
  return {
    success: true,
    data: {
      province,
      sections,
      findGuideUrl: `/api/provinces/${slug}/guides` // Task 2: Integration
    }
  };
};

/**
 * Get province by ID
 * @param {string} id - Province ID
 * @returns {Promise<{success: boolean, data: Province, message?: string}>}
 */
const getProvinceById = async (id) => {
  const province = await provinceRepository.findById(id);
  
  if (!province) {
    return {
      success: false,
      message: 'Province not found'
    };
  }
  
  return {
    success: true,
    data: province
  };
};

/**
 * Search provinces by name
 * @param {string} searchTerm - Search term
 * @returns {Promise<{success: boolean, data: Province[]}>}
 */
const searchProvinces = async (searchTerm) => {
  const provinces = await provinceRepository.searchByName(searchTerm);
  
  return {
    success: true,
    data: provinces
  };
};

/**
 * Get province statistics
 * @param {string} slug - Province slug
 * @returns {Promise<{success: boolean, data: Object, message?: string}>}
 */
const getProvinceStats = async (slug) => {
  const province = await provinceRepository.findBySlug(slug);
  
  if (!province) {
    return {
      success: false,
      message: 'Province not found'
    };
  }
  
  const totalPlaces = await placeRepository.countByProvince(province._id);
  
  // Count by type
  const [archaeological, entertainment, hotels, events] = await Promise.all([
    placeRepository.findByProvince(province._id, { type: 'archaeological' }).then(r => r.total),
    placeRepository.findByProvince(province._id, { type: 'entertainment' }).then(r => r.total),
    placeRepository.findByProvince(province._id, { type: 'hotels' }).then(r => r.total),
    placeRepository.findByProvince(province._id, { type: 'events' }).then(r => r.total)
  ]);
  
  return {
    success: true,
    data: {
      province: {
        name: province.name,
        slug: province.slug
      },
      stats: {
        totalPlaces,
        byType: {
          archaeological,
          entertainment,
          hotels,
          events
        }
      }
    }
  };
};

export {
  getAllProvinces,
  getProvinceBySlug,
  getProvinceById,
  searchProvinces,
  getProvinceStats
};

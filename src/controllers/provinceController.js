/**
 * Province Controller
 * Handles HTTP requests for province endpoints
 */

import * as provinceService from '../services/provinceService.js';

/**
 * Get all provinces
 * @route GET /api/provinces
 */
const getAllProvinces = async (req, res, next) => {
  try {
    const result = await provinceService.getAllProvinces();
    
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get province by slug with sections
 * @route GET /api/provinces/:slug
 */
const getProvinceBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Province slug is required'
      });
    }
    
    const result = await provinceService.getProvinceBySlug(slug);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get province statistics
 * @route GET /api/provinces/:slug/stats
 */
const getProvinceStats = async (req, res, next) => {
  try {
    const { slug } = req.params;
    
    const result = await provinceService.getProvinceStats(slug);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Search provinces
 * @route GET /api/provinces/search?q=term
 */
const searchProvinces = async (req, res, next) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const result = await provinceService.searchProvinces(q);
    
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export {
  getAllProvinces,
  getProvinceBySlug,
  getProvinceStats,
  searchProvinces
};

/**
 * Place Repository
 * Data access layer for Place model
 */

import Place from '../models/Place.js';
import { generateGoogleMapsUrl } from '../utils/googleMaps.js';

/**
 * Find all places with pagination
 * @param {Object} options - Query options
 * @returns {Promise<{places: Place[], total: number}>}
 */
const findAll = async (options = {}) => {
  const { limit = 20, skip = 0, sort = '-createdAt' } = options;
  
  const [places, total] = await Promise.all([
    Place.find({ isActive: true })
      .populate('province', 'name slug')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .lean(),
    Place.countDocuments({ isActive: true })
  ]);
  
  return { places, total };
};

/**
 * Find place by ID
 * @param {string} id - Place ID
 * @returns {Promise<Place|null>}
 */
const findById = async (id) => {
  const place = await Place.findById(id)
    .populate('province', 'name slug coverImage')
    .lean();
  
  if (place && place.location && place.location.coordinates) {
    place.googleMapsUrl = generateGoogleMapsUrl(place.location.coordinates);
  }
  
  return place;
};

/**
 * Find place by slug
 * @param {string} slug - Place slug
 * @returns {Promise<Place|null>}
 */
const findBySlug = async (slug) => {
  const place = await Place.findBySlug(slug);
  
  if (place && place.location && place.location.coordinates) {
    place.googleMapsUrl = generateGoogleMapsUrl(place.location.coordinates);
  }
  
  return place;
};

/**
 * Find places by province
 * @param {string} provinceId - Province ID
 * @param {Object} options - Query options
 * @returns {Promise<{places: Place[], total: number}>}
 */
const findByProvince = async (provinceId, options = {}) => {
  const { type, limit = 20, skip = 0, sort = '-rating -viewsCount' } = options;
  
  const query = { province: provinceId, isActive: true };
  if (type) {
    query.type = type;
  }
  
  const [places, total] = await Promise.all([
    Place.find(query)
      .select('-__v')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .lean(),
    Place.countDocuments(query)
  ]);
  
  // Add Google Maps URLs
  places.forEach(place => {
    if (place.location && place.location.coordinates) {
      place.googleMapsUrl = generateGoogleMapsUrl(place.location.coordinates);
    }
  });
  
  return { places, total };
};

/**
 * Find places by province and group by type
 * @param {string} provinceId - Province ID
 * @returns {Promise<Object>}
 */
const findByProvinceGrouped = async (provinceId) => {
  const places = await Place.find({ province: provinceId, isActive: true })
    .select('name slug shortDescription images location type ticketPrice rating openingHours tags')
    .sort('-rating -viewsCount')
    .lean();
  
  const grouped = {
    archaeological: [],
    entertainment: [],
    hotels: [],
    events: []
  };
  
  places.forEach(place => {
    if (place.location && place.location.coordinates) {
      place.googleMapsUrl = generateGoogleMapsUrl(place.location.coordinates);
    }
    if (grouped[place.type]) {
      grouped[place.type].push(place);
    }
  });
  
  return grouped;
};

/**
 * Find places near coordinates
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {Object} options - Query options
 * @returns {Promise<Place[]>}
 */
const findNear = async (lng, lat, options = {}) => {
  const { radius = 10000, type = null, limit = 50 } = options;
  
  const places = await Place.findNear(lng, lat, radius, type);
  
  // Add Google Maps URLs
  places.forEach(place => {
    if (place.location && place.location.coordinates) {
      place.googleMapsUrl = generateGoogleMapsUrl(place.location.coordinates);
    }
  });
  
  return places;
};

/**
 * Create or update place
 * @param {Object} placeData - Place data
 * @returns {Promise<Place>}
 */
const upsert = async (placeData) => {
  const { slug } = placeData;
  return Place.findOneAndUpdate(
    { slug },
    placeData,
    { upsert: true, new: true, runValidators: true }
  );
};

/**
 * Create new place
 * @param {Object} placeData - Place data
 * @returns {Promise<Place>}
 */
const create = async (placeData) => {
  const place = new Place(placeData);
  return place.save();
};

/**
 * Update place by ID
 * @param {string} id - Place ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Place|null>}
 */
const updateById = async (id, updateData) => {
  return Place.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
};

/**
 * Delete place by ID
 * @param {string} id - Place ID
 * @returns {Promise<Place|null>}
 */
const deleteById = async (id) => {
  return Place.findByIdAndDelete(id);
};

/**
 * Count places by province
 * @param {string} provinceId - Province ID
 * @returns {Promise<number>}
 */
const countByProvince = async (provinceId) => {
  return Place.countDocuments({ province: provinceId, isActive: true });
};

/**
 * Count all places
 * @returns {Promise<number>}
 */
const count = async () => {
  return Place.countDocuments({ isActive: true });
};

/**
 * Search places
 * @param {string} searchTerm - Search term
 * @param {Object} options - Query options
 * @returns {Promise<Place[]>}
 */
const search = async (searchTerm, options = {}) => {
  const { type, limit = 20 } = options;
  
  const query = {
    isActive: true,
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { tags: { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  if (type) {
    query.type = type;
  }
  
  return Place.find(query)
    .populate('province', 'name slug')
    .limit(limit)
    .lean();
};

/**
 * Increment place view count
 * @param {string} id - Place ID
 * @returns {Promise<Place|null>}
 */
const incrementViews = async (id) => {
  return Place.findByIdAndUpdate(
    id,
    { $inc: { viewsCount: 1 } },
    { new: true }
  );
};

export {
  findAll,
  findById,
  findBySlug,
  findByProvince,
  findByProvinceGrouped,
  findNear,
  upsert,
  create,
  updateById,
  deleteById,
  countByProvince,
  count,
  search,
  incrementViews
};

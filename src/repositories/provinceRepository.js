/**
 * Province Repository
 * Data access layer for Province model
 */

import Province from '../models/Province.js';

/**
 * Find all provinces
 * @returns {Promise<Province[]>}
 */
const findAll = async () => {
  return Province.getAllBasic();
};

/**
 * Find province by ID
 * @param {string} id - Province ID
 * @returns {Promise<Province|null>}
 */
const findById = async (id) => {
  return Province.findById(id).lean();
};

/**
 * Find province by slug
 * @param {string} slug - Province slug
 * @returns {Promise<Province|null>}
 */
const findBySlug = async (slug) => {
  return Province.findBySlug(slug);
};

/**
 * Create or update province
 * @param {Object} provinceData - Province data
 * @returns {Promise<Province>}
 */
const upsert = async (provinceData) => {
  const { slug } = provinceData;
  return Province.findOneAndUpdate(
    { slug },
    provinceData,
    { upsert: true, new: true, runValidators: true }
  );
};

/**
 * Create new province
 * @param {Object} provinceData - Province data
 * @returns {Promise<Province>}
 */
const create = async (provinceData) => {
  const province = new Province(provinceData);
  return province.save();
};

/**
 * Update province by ID
 * @param {string} id - Province ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Province|null>}
 */
const updateById = async (id, updateData) => {
  return Province.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
};

/**
 * Delete province by ID
 * @param {string} id - Province ID
 * @returns {Promise<Province|null>}
 */
const deleteById = async (id) => {
  return Province.findByIdAndDelete(id);
};

/**
 * Count all provinces
 * @returns {Promise<number>}
 */
const count = async () => {
  return Province.countDocuments();
};

/**
 * Search provinces by name
 * @param {string} searchTerm - Search term
 * @returns {Promise<Province[]>}
 */
const searchByName = async (searchTerm) => {
  return Province.find({
    name: { $regex: searchTerm, $options: 'i' }
  })
    .select('name slug description coverImage')
    .limit(20)
    .lean();
};

export {
  findAll,
  findById,
  findBySlug,
  upsert,
  create,
  updateById,
  deleteById,
  count,
  searchByName
};

/**
 * Province Model
 * Represents an Egyptian Governorate with tourism content
 */

import mongoose from 'mongoose';

const provinceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    coverImage: {
      type: String,
      required: true,
      trim: true
    },
    // Additional metadata
    population: {
      type: Number,
      default: null
    },
    area: {
      type: Number, // in square kilometers
      default: null
    },
    capital: {
      type: String,
      default: null
    },
    // Geospatial center point
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [31.2357, 30.0444] // Default to Cairo
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
provinceSchema.index({ slug: 1 });
provinceSchema.index({ name: 1 });
provinceSchema.index({ location: '2dsphere' });

// Virtual for places count (populated when needed)
provinceSchema.virtual('placesCount', {
  ref: 'Place',
  localField: '_id',
  foreignField: 'province',
  count: true
});

/**
 * Find province by slug
 * @param {string} slug - Province slug
 * @returns {Promise<Province|null>}
 */
provinceSchema.statics.findBySlug = async function(slug) {
  return this.findOne({ slug: slug.toLowerCase() });
};

/**
 * Get all provinces with basic info
 * @returns {Promise<Province[]>}
 */
provinceSchema.statics.getAllBasic = async function() {
  return this.find({})
    .select('name slug description coverImage location')
    .sort('name')
    .lean();
};

const Province = mongoose.model('Province', provinceSchema);

export default Province;

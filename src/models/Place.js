/**
 * Place Model
 * Represents a tourist attraction, hotel, event, or entertainment venue
 */

import mongoose from "mongoose";

const placeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    province: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["archaeological", "entertainment", "hotels", "events"],
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    shortDescription: {
      type: String,
      trim: true,
    },
    images: {
      type: [String],
      required: true,
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: "At least one image is required",
      },
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: function (v) {
            return (
              v.length === 2 &&
              v[0] >= -180 &&
              v[0] <= 180 &&
              v[1] >= -90 &&
              v[1] <= 90
            );
          },
          message: "Invalid coordinates format",
        },
      },
    },
    address: {
      type: String,
      trim: true,
    },
    ticketPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    openingHours: {
      type: String,
      default: null,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    // Event-specific fields
    eventDate: {
      type: Date,
      default: null,
    },
    eventEndDate: {
      type: Date,
      default: null,
    },
    // Hotel-specific fields
    stars: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    // Contact information
    phone: {
      type: String,
      default: null,
    },
    website: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    // Reviews and ratings
    reviewsCount: {
      type: Number,
      default: 0,
    },
    reviews: [
      {
        userName: String,
        userAvatar: String,
        rating: { type: Number, min: 1, max: 5 },
        title: String,
        comment: String,
        date: { type: Date, default: Date.now },
        helpful: { type: Number, default: 0 },
      },
    ],
    // Visitor tips
    tips: [
      {
        text: String,
        category: String, // 'timing', 'money', 'safety', 'general'
      },
    ],
    // Amenities and facilities
    amenities: [String], // e.g., ['WiFi', 'Parking', 'Restaurant', 'Gift Shop', 'Wheelchair Accessible']
    facilities: [String], // e.g., ['Restrooms', 'Audio Guide', 'Lockers', 'Cafe']
    // Visit information
    suggestedDuration: {
      type: String,
      default: null, // e.g., '2-3 hours'
    },
    bestTimeToVisit: {
      type: String,
      default: null, // e.g., 'Early morning', 'Weekdays'
    },
    // Pricing
    currency: {
      type: String,
      default: "USD",
    },
    // Metadata
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes
placeSchema.index({ province: 1, type: 1 });
placeSchema.index({ province: 1, isActive: 1 });
placeSchema.index({ type: 1, isActive: 1 });
placeSchema.index({ location: "2dsphere" });
placeSchema.index({ tags: 1 });

// Virtual for Google Maps URL
placeSchema.virtual("googleMapsUrl").get(function () {
  if (this.location && this.location.coordinates) {
    const [lng, lat] = this.location.coordinates;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return null;
});

/**
 * Find place by slug
 * @param {string} slug - Place slug
 * @returns {Promise<Place|null>}
 */
placeSchema.statics.findBySlug = async function (slug) {
  return this.findOne({ slug: slug.toLowerCase(), isActive: true }).populate(
    "province",
    "name slug"
  );
};

/**
 * Find places by province and type
 * @param {ObjectId} provinceId - Province ID
 * @param {string} type - Place type
 * @param {Object} options - Query options (limit, skip)
 * @returns {Promise<Place[]>}
 */
placeSchema.statics.findByProvinceAndType = async function (
  provinceId,
  type,
  options = {}
) {
  const query = { province: provinceId, isActive: true };
  if (type) {
    query.type = type;
  }

  return this.find(query)
    .limit(options.limit || 20)
    .skip(options.skip || 0)
    .sort(options.sort || "-rating -viewsCount")
    .lean();
};

/**
 * Find places near coordinates
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {number} radius - Radius in meters
 * @param {string} type - Optional type filter
 * @returns {Promise<Place[]>}
 */
placeSchema.statics.findNear = async function (
  lng,
  lat,
  radius = 10000,
  type = null
) {
  const query = {
    isActive: true,
    location: {
      $nearSphere: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        $maxDistance: radius,
      },
    },
  };

  if (type) {
    query.type = type;
  }

  return this.find(query).limit(50).lean();
};

/**
 * Increment view count
 * @returns {Promise<Place>}
 */
placeSchema.methods.incrementViews = async function () {
  this.viewsCount += 1;
  return this.save();
};

const Place = mongoose.model("Place", placeSchema);

export default Place;

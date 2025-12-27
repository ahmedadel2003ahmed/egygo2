import mongoose from 'mongoose';

const attractionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
        index: true,
      },
    },
    images: [
      {
        url: String,
        publicId: String,
      },
    ],
    openingHours: {
      type: String,
    },
    ticketPrice: {
      type: Number,
      min: 0,
    },
    category: {
      type: String,
      enum: ['historical', 'museum', 'religious', 'natural', 'entertainment', 'other'],
      default: 'other',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// GeoJSON index for location-based queries
attractionSchema.index({ 'location': '2dsphere' });

const Attraction = mongoose.model('Attraction', attractionSchema);

export default Attraction;

import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["id_document", "tourism_card", "english_certificate", "other"],
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    note: {
      type: String, // Admin note on rejection/approval
    },
  },
  { _id: true }
);

const guideSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    province: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      index: true,
    },
    provinces: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Province",
      },
    ],
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    canEnterArchaeologicalSites: {
      type: Boolean,
      default: false,
    },
    isLicensed: {
      type: Boolean,
      default: false,
    },
    languages: {
      type: [String],
      default: [],
    },
    pricePerHour: {
      type: Number,
      required: true,
      min: 0,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    avatar: {
      type: String, // URL
    },
    photo: {
      url: {
        type: String,
        default: null,
      },
      publicId: {
        type: String,
        default: null,
      },
    },
    gallery: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },
    availability: [
      {
        dayOfWeek: {
          type: Number, // 0 = Sunday, 6 = Saturday
          min: 0,
          max: 6,
        },
        startTime: String, // e.g., "09:00"
        endTime: String, // e.g., "18:00"
      },
    ],
    documents: [documentSchema],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalTrips: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for queries
guideSchema.index({ province: 1 });
guideSchema.index({ slug: 1 });
guideSchema.index({ location: "2dsphere" });
guideSchema.index({ isVerified: 1, isActive: 1 });
guideSchema.index({ pricePerHour: 1 });
guideSchema.index({ languages: 1 });

const Guide = mongoose.model("Guide", guideSchema);

export default Guide;

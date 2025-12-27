import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    guide: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guide",
      required: true,
      index: true,
    },
    tourist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    // Review aspects
    aspects: {
      communication: {
        type: Number,
        min: 1,
        max: 5,
      },
      knowledge: {
        type: Number,
        min: 1,
        max: 5,
      },
      professionalism: {
        type: Number,
        min: 1,
        max: 5,
      },
      friendliness: {
        type: Number,
        min: 1,
        max: 5,
      },
    },
    // Response from guide
    response: {
      text: {
        type: String,
        trim: true,
        maxlength: 500,
      },
      respondedAt: {
        type: Date,
      },
    },
    // Helpful votes
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Moderation
    isVerified: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one review per trip per tourist
reviewSchema.index({ trip: 1, tourist: 1 }, { unique: true });

// Index for queries
reviewSchema.index({ guide: 1, createdAt: -1 });
reviewSchema.index({ tourist: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ isHidden: 1, isVerified: 1 });

// Virtual for overall aspect rating
reviewSchema.virtual("aspectsAverage").get(function () {
  if (!this.aspects) return null;

  const ratings = Object.values(this.aspects).filter((r) => r != null);
  if (ratings.length === 0) return null;

  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
});

// Ensure virtuals are included in JSON
reviewSchema.set("toJSON", { virtuals: true });
reviewSchema.set("toObject", { virtuals: true });

const Review = mongoose.model("Review", reviewSchema);

export default Review;

import mongoose from "mongoose";
import { TRIP_STATES } from "../utils/tripStateMachine.js";

/**
 * Trip Model - Multi-place itinerary with comprehensive pricing
 * Supports detailed itinerary planning with multiple attractions/places
 */

// Itinerary item schema for each place in the trip
const itineraryItemSchema = new mongoose.Schema(
  {
    place: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attraction",
      required: false, // Optional if just a generic stop
    },
    visitDurationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    ticketRequired: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

const tripSchema = new mongoose.Schema(
  {
    tourist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // NEW FLOW: Guide is optional at creation - selected later
    guide: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guide",
      required: false, 
      index: true,
      default: null,
    },
    // The specific guide selected by tourist for this trip
    selectedGuide: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guide",
      index: true,
      default: null,
    },
    // List of compatible guides found by system
    candidateGuides: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Guide",
      default: [],
    },
    // Call history for this trip
    callSessions: [
      {
        callId: {
          type: String,
          required: true,
        },
        guideId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Guide",
        },
        startedAt: {
          type: Date,
        },
        endedAt: {
          type: Date,
        },
        duration: {
          type: Number, // in seconds
        },
        summary: {
          type: String,
          maxlength: 2000,
        },
        negotiatedPrice: {
          type: Number,
          min: 0,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    itinerary: {
      type: [itineraryItemSchema],
      default: [],
    },
    negotiatedPrice: {
      type: Number,
      required: false, // Optional until negotiation completes
      min: 0,
    },
    startAt: {
      type: Date,
      required: true,
      index: true,
    },
    totalDurationMinutes: {
      type: Number,
      min: 1,
    },
    endAt: {
      type: Date,
      // Calculated when totalDurationMinutes is known
    },
    meetingPoint: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },
    meetingAddress: {
      type: String,
      trim: true,
    },
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      index: true,
    },
    priceBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // Structure: { guideFee: Number, tickets: Number, serviceFee: Number, total: Number }
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "pending", "paid", "deposit_paid", "refunded"],
      default: "unpaid",
      index: true,
    },
    // Stripe payment integration fields
    stripeSessionId: {
      type: String,
      default: null,
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
      index: true,
    },
    currency: {
      type: String,
      default: process.env.CURRENCY || "usd",
    },
    status: {
      type: String,
      enum: Object.values(TRIP_STATES),
      default: TRIP_STATES.SELECTING_GUIDE,
      index: true,
    },
    meta: {
      createdFromPlaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attraction",
      },
      agreementSource: {
        type: String,
        enum: ["call", "manual", "proposal", "new_flow", "in_app"],
      },
      agreementNote: {
        type: String,
        maxlength: 1000,
      },
      // Call ID reference for quick lookup
      callId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CallSession",
      },
    },

    // --- DEPRECATED / LEGACY FIELDS ---
    // Kept to prevent breaking legacy code, but should not be used in new flow
    callId: { type: String, select: false },
    price: { type: Number, min: 0, select: false },
    offers: { type: Array, select: false },
    proposal: { type: Object, select: false },
    proposalHistory: { type: Array, select: false },
    cancellationReason: { type: String },
    cancelledBy: { type: String, enum: ["tourist", "guide", "admin"] },
    cancelledAt: { type: Date },
    review: {
      rating: { type: Number, min: 1, max: 5, default: null },
      comment: { type: String, maxlength: 500, default: null },
      reviewedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// GeoJSON index for location-based queries
tripSchema.index({ meetingPoint: "2dsphere" });

// Compound indexes for efficient queries
tripSchema.index({ guide: 1, startAt: 1, status: 1 });
tripSchema.index({ tourist: 1, startAt: -1 });
tripSchema.index({ status: 1, startAt: 1 });

const Trip = mongoose.model("Trip", tripSchema);

export default Trip;


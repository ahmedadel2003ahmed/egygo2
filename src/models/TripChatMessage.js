import mongoose from "mongoose";
import { ROLES } from "../utils/constants.js";

/**
 * TripChatMessage Model
 * Stores text chat messages between Tourist and Guide within a Trip context
 *
 * Business Rules:
 * - Messages can only be sent after guide is selected (selectedGuide exists)
 * - Each message must be tied to a valid trip
 * - Only Tourist and Guide roles can send messages
 * - Tourist can only message their assigned guide
 * - Guide can only message the tourist of their trip
 */

const senderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender user is required"],
    },
    role: {
      type: String,
      enum: {
        values: [ROLES.TOURIST, ROLES.GUIDE],
        message: "Sender role must be either tourist or guide",
      },
      required: [true, "Sender role is required"],
    },
  },
  { _id: false }
);

const receiverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Receiver user is required"],
    },
    role: {
      type: String,
      enum: {
        values: [ROLES.TOURIST, ROLES.GUIDE],
        message: "Receiver role must be either tourist or guide",
      },
      required: [true, "Receiver role is required"],
    },
  },
  { _id: false }
);

const tripChatMessageSchema = new mongoose.Schema(
  {
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: [true, "Trip reference is required"],
      index: true,
    },
    sender: {
      type: senderSchema,
      required: [true, "Sender information is required"],
    },
    receiver: {
      type: receiverSchema,
      required: [true, "Receiver information is required"],
    },
    message: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      minlength: [1, "Message cannot be empty"],
      maxlength: [5000, "Message cannot exceed 5000 characters"],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We manually manage createdAt
    versionKey: false,
  }
);

// Compound indexes for efficient querying
tripChatMessageSchema.index({ trip: 1, createdAt: 1 });
tripChatMessageSchema.index({ "sender.user": 1, trip: 1 });
tripChatMessageSchema.index({ "receiver.user": 1, trip: 1 });

// Pre-save validation to ensure sender and receiver are different
tripChatMessageSchema.pre("save", function (next) {
  if (this.sender.user.equals(this.receiver.user)) {
    return next(new Error("Sender and receiver cannot be the same user"));
  }

  if (this.sender.role === this.receiver.role) {
    return next(new Error("Sender and receiver must have different roles"));
  }

  next();
});

// Static method to get messages for a trip
tripChatMessageSchema.statics.getMessagesForTrip = async function (
  tripId,
  limit = 100,
  skip = 0
) {
  return this.find({ trip: tripId })
    .sort({ createdAt: 1 }) // Oldest first
    .skip(skip)
    .limit(limit)
    .select("sender receiver message createdAt")
    .lean();
};

// Static method to count messages for a trip
tripChatMessageSchema.statics.countMessagesForTrip = async function (tripId) {
  return this.countDocuments({ trip: tripId });
};

const TripChatMessage = mongoose.model(
  "TripChatMessage",
  tripChatMessageSchema
);

export default TripChatMessage;

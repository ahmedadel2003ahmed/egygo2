import mongoose from 'mongoose';

const callSessionSchema = new mongoose.Schema(
  {
    channelName: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    touristUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    guideUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    touristUid: {
      type: Number,
      required: true,
    },
    guideUid: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['ringing', 'ongoing', 'ended', 'cancelled'],
      default: 'ringing',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    maxDurationSeconds: {
      type: Number,
      required: true,
      default: 300, // 5 minutes
    },
    endReason: {
      type: String,
      enum: ['completed', 'timeout', 'cancelled', 'no_answer', 'technical_issue'],
    },
    summary: {
      type: String,
      maxlength: 1000,
      description: 'Summary of what was discussed during the call',
    },
    negotiatedPrice: {
      type: Number,
      min: 0,
      description: 'Price agreed upon during the call',
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for finding active sessions by user
callSessionSchema.index({ touristUser: 1, status: 1 });
callSessionSchema.index({ guideUser: 1, status: 1 });

const CallSession = mongoose.model('CallSession', callSessionSchema);

export default CallSession;

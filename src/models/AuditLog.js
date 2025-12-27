import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'upload_document',
        'admin_approve_document',
        'admin_reject_document',
        'delete_document',
        'apply_guide',
        'accept_trip',
        'reject_trip',
        'cancel_trip',
        'update_guide_profile',
        'login',
        'logout',
        'password_change',
        'create_trip',
        'select_guide_for_trip',
        'initiate_trip_call',
        'end_trip_call',
      ],
    },
    resourceType: {
      type: String,
      enum: ['user', 'guide', 'trip', 'document', 'attraction'],
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// Compound index for efficient querying
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;

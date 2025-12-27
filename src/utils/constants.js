/**
 * Application constants
 */

export const ROLES = {
  TOURIST: 'tourist',
  GUIDE: 'guide',
  ADMIN: 'admin',
};

export const TRIP_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const DOCUMENT_TYPES = {
  ID_DOCUMENT: 'id_document',
  TOURISM_CARD: 'tourism_card',
  ENGLISH_CERTIFICATE: 'english_certificate',
  OTHER: 'other',
};

export const DOCUMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const AUDIT_ACTIONS = {
  UPLOAD_DOCUMENT: 'upload_document',
  ADMIN_APPROVE_DOCUMENT: 'admin_approve_document',
  ADMIN_REJECT_DOCUMENT: 'admin_reject_document',
  DELETE_DOCUMENT: 'delete_document',
  APPLY_GUIDE: 'apply_guide',
  ACCEPT_TRIP: 'accept_trip',
  REJECT_TRIP: 'reject_trip',
  CANCEL_TRIP: 'cancel_trip',
  UPDATE_GUIDE_PROFILE: 'update_guide_profile',
  LOGIN: 'login',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  CREATE_TRIP: 'create_trip',
  SELECT_GUIDE_FOR_TRIP: 'select_guide_for_trip',
  INITIATE_TRIP_CALL: 'initiate_trip_call',
  END_TRIP_CALL: 'end_trip_call',
};

export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || '8388608'); // 8MB

export const CLOUDINARY_FOLDERS = {
  GUIDES: 'localguide/guides',
  TOURISTS: 'localguide/tourists',
  ATTRACTIONS: 'localguide/attractions',
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  EMAIL_NOT_VERIFIED: 'Please verify your email before logging in',
  USER_NOT_FOUND: 'User not found',
  EMAIL_ALREADY_EXISTS: 'Email already registered',
  INVALID_OTP: 'Invalid or expired OTP',
  OTP_EXPIRED: 'OTP has expired',
  MAX_OTP_ATTEMPTS: 'Maximum OTP verification attempts exceeded',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'You do not have permission to perform this action',
  TOKEN_EXPIRED: 'Token has expired',
  INVALID_TOKEN: 'Invalid token',
  GUIDE_NOT_FOUND: 'Guide not found',
  TRIP_NOT_FOUND: 'Trip not found',
  ATTRACTION_NOT_FOUND: 'Attraction not found',
  GUIDE_NOT_AVAILABLE: 'Guide is not available for the selected time',
  TOURISM_CARD_REQUIRED: 'Tourism card is required for licensed guides',
  DOCUMENT_NOT_FOUND: 'Document not found',
  INVALID_FILE_TYPE: 'Invalid file type. Allowed types: jpg, jpeg, png, pdf',
  FILE_TOO_LARGE: 'File size exceeds maximum limit',
};

export const SUCCESS_MESSAGES = {
  REGISTRATION_SUCCESS: 'Registration successful. Please check your email for verification code.',
  OTP_SENT: 'OTP sent to your email',
  EMAIL_VERIFIED: 'Email verified successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  PASSWORD_CHANGED: 'Password changed successfully',
  PROFILE_UPDATED: 'Profile updated successfully',
  GUIDE_APPLICATION_SUBMITTED: 'Guide application submitted successfully',
  DOCUMENT_UPLOADED: 'Document uploaded successfully',
  DOCUMENT_DELETED: 'Document deleted successfully',
  TRIP_CREATED: 'Trip created successfully',
  TRIP_UPDATED: 'Trip updated successfully',
  TRIP_CANCELLED: 'Trip cancelled successfully',
};

// Cancellation window in hours
export const TRIP_CANCELLATION_WINDOW_HOURS = 24;

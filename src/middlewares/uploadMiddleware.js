import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  ERROR_MESSAGES,
} from "../utils/constants.js";

/**
 * File filter to validate file types
 */
const fileFilter = (req, file, cb) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(ERROR_MESSAGES.INVALID_FILE_TYPE), false);
  }
};

/**
 * Cloudinary storage for guide documents
 */
const guideDocumentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const userId = req.userId || req.user?._id;

    // Use different folder for photos and gallery
    if (file.fieldname === "photo" || file.fieldname === "gallery") {
      return {
        folder: `localguide/guides/${userId}/photos`,
        allowed_formats: ["jpg", "jpeg", "png"],
        transformation: [
          { width: 500, height: 500, crop: "fill", quality: "auto" },
        ],
      };
    }

    // Documents folder for other files
    const folder = `localguide/guides/${userId}/documents`;

    // Determine resource type based on mime type
    const resourceType = file.mimetype === "application/pdf" ? "raw" : "image";

    return {
      folder: folder,
      resource_type: resourceType,
      allowed_formats: ["jpg", "jpeg", "png", "pdf"],
    };
  },
});

/**
 * Cloudinary storage for tourist avatars
 */
const touristAvatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "localguide/tourists/avatars",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 400, height: 400, crop: "fill" }],
  },
});

/**
 * Multer upload for guide documents and photo
 */
export const uploadGuideDocuments = multer({
  storage: guideDocumentStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
}).fields([
  { name: "idDocument", maxCount: 1 },
  { name: "tourismCard", maxCount: 1 },
  { name: "englishCertificate", maxCount: 1 },
  { name: "otherDocs", maxCount: 5 },
  { name: "photo", maxCount: 1 },
]);

/**
 * Multer upload for single document
 */
export const uploadSingleDocument = multer({
  storage: guideDocumentStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
}).single("document");

/**
 * Multer upload for tourist avatar
 */
export const uploadAvatar = multer({
  storage: touristAvatarStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
}).single("avatar");

/**
 * Multer upload for guide gallery images (multiple)
 */
export const uploadGalleryImages = multer({
  storage: guideDocumentStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
}).array("gallery", 10); // Allow up to 10 images

/**
 * Error handler for multer errors
 */
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: ERROR_MESSAGES.FILE_TOO_LARGE,
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next();
};

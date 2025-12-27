import mongoose from "mongoose";
import guideRepository from "../repositories/guideRepository.js";
import userRepository from "../repositories/userRepository.js";
import cloudinaryService from "./cloudinaryService.js";
import notificationService from "./notificationService.js";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
  CLOUDINARY_FOLDERS,
  AUDIT_ACTIONS,
} from "../utils/constants.js";
import { logAudit } from "../utils/auditLogger.js";

/**
 * Guide Service - Business logic for guide operations
 */
class GuideService {
  /**
   * Apply as guide
   */
  async applyAsGuide(userId, guideData, files, ipAddress, userAgent) {
    const { languages, pricePerHour, bio, isLicensed, provinces } = guideData;

    // Check if user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Check if guide profile already exists
    const existingGuide = await guideRepository.findByUserId(userId);
    if (existingGuide) {
      throw new Error("Guide profile already exists");
    }

    // Validate required documents
    if (!files.idDocument || files.idDocument.length === 0) {
      throw new Error("ID document is required");
    }

    if (isLicensed && (!files.tourismCard || files.tourismCard.length === 0)) {
      throw new Error(ERROR_MESSAGES.TOURISM_CARD_REQUIRED);
    }

    // Validate required photo
    if (!files.photo || files.photo.length === 0) {
      throw new Error("Guide photo is required");
    }

    // Prepare documents array
    const documents = [];

    // Upload ID document
    const idDocFolder = `${CLOUDINARY_FOLDERS.GUIDES}/${userId}/documents`;
    const idDocUpload = await cloudinaryService.uploadFile(
      files.idDocument[0].path,
      idDocFolder
    );
    documents.push({
      url: idDocUpload.url,
      publicId: idDocUpload.publicId,
      type: DOCUMENT_TYPES.ID_DOCUMENT,
      status: DOCUMENT_STATUS.PENDING,
    });

    // Upload tourism card if licensed
    if (isLicensed && files.tourismCard && files.tourismCard.length > 0) {
      const tourismCardUpload = await cloudinaryService.uploadFile(
        files.tourismCard[0].path,
        idDocFolder
      );
      documents.push({
        url: tourismCardUpload.url,
        publicId: tourismCardUpload.publicId,
        type: DOCUMENT_TYPES.TOURISM_CARD,
        status: DOCUMENT_STATUS.PENDING,
      });
    }

    // Upload English certificate if provided
    if (files.englishCertificate && files.englishCertificate.length > 0) {
      const certUpload = await cloudinaryService.uploadFile(
        files.englishCertificate[0].path,
        idDocFolder
      );
      documents.push({
        url: certUpload.url,
        publicId: certUpload.publicId,
        type: DOCUMENT_TYPES.ENGLISH_CERTIFICATE,
        status: DOCUMENT_STATUS.PENDING,
      });
    }

    // Upload other documents if provided
    if (files.otherDocs && files.otherDocs.length > 0) {
      for (const file of files.otherDocs) {
        const upload = await cloudinaryService.uploadFile(
          file.path,
          idDocFolder
        );
        documents.push({
          url: upload.url,
          publicId: upload.publicId,
          type: DOCUMENT_TYPES.OTHER,
          status: DOCUMENT_STATUS.PENDING,
        });
      }
    }

    // Upload photo (required)
    const photoFolder = `${CLOUDINARY_FOLDERS.GUIDES}/${userId}/photos`;
    const photoUpload = await cloudinaryService.uploadFile(
      files.photo[0].path,
      photoFolder
    );
    const photoData = {
      url: photoUpload.url,
      publicId: photoUpload.publicId,
    };

    // Normalize provinces field
    let normalizedProvinces = [];
    if (provinces !== undefined && provinces !== null && provinces !== "") {
      const provincesArray = Array.isArray(provinces) ? provinces : [provinces];
      normalizedProvinces = provincesArray
        .filter(
          (id) =>
            id && typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
        )
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    // Set default location based on first province (if available)
    let locationData = null;
    if (normalizedProvinces.length > 0) {
      try {
        const Province = mongoose.model("Province");
        const firstProvince = await Province.findById(normalizedProvinces[0]);
        if (
          firstProvince &&
          firstProvince.location &&
          firstProvince.location.coordinates
        ) {
          locationData = {
            type: "Point",
            coordinates: firstProvince.location.coordinates,
          };
        }
      } catch (err) {
        console.warn(
          "Failed to set default location from province:",
          err.message
        );
      }
    }

    // Create guide profile
    const guide = await guideRepository.create({
      user: userId,
      name: user.name, // Add name from user
      languages: Array.isArray(languages) ? languages : [languages],
      pricePerHour,
      bio,
      isLicensed: isLicensed === "true" || isLicensed === true,
      provinces: normalizedProvinces,
      documents,
      photo: photoData,
      location: locationData,
      rating: 0,
      isVerified: false,
      canEnterArchaeologicalSites: false,
    });

    // Update user role to guide
    await userRepository.findByIdAndUpdate(userId, { role: "guide" });

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.APPLY_GUIDE,
      resourceType: "guide",
      resourceId: guide._id,
      details: {
        isLicensed: guide.isLicensed,
        documentsCount: documents.length,
      },
      ipAddress,
      userAgent,
    });

    // Notify admins
    await notificationService.notifyAdminNewGuideApplication(guide, user);

    return {
      message: SUCCESS_MESSAGES.GUIDE_APPLICATION_SUBMITTED,
      guide,
    };
  }

  /**
   * Upload additional document
   */
  async uploadDocument(userId, file, documentType, ipAddress, userAgent) {
    const guide = await guideRepository.findByUserId(userId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    const user = await userRepository.findById(userId);

    // Upload file
    const folder = `${CLOUDINARY_FOLDERS.GUIDES}/${userId}/documents`;
    const upload = await cloudinaryService.uploadFile(file.path, folder);

    // Add document to guide
    const documentData = {
      url: upload.url,
      publicId: upload.publicId,
      type: documentType,
      status: DOCUMENT_STATUS.PENDING,
    };

    const updatedGuide = await guideRepository.addDocument(
      guide._id,
      documentData
    );

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.UPLOAD_DOCUMENT,
      resourceType: "document",
      resourceId: guide._id,
      details: { documentType },
      ipAddress,
      userAgent,
    });

    // Notify admins if tourism card
    if (documentType === DOCUMENT_TYPES.TOURISM_CARD) {
      await notificationService.notifyAdminDocumentUploaded(
        guide,
        user,
        documentData
      );
    }

    return {
      message: SUCCESS_MESSAGES.DOCUMENT_UPLOADED,
      guide: updatedGuide,
    };
  }

  /**
   * Delete document
   */
  async deleteDocument(userId, documentId, ipAddress, userAgent) {
    const guide = await guideRepository.findByUserId(userId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    // Find document
    const document = await guideRepository.getDocument(guide._id, documentId);
    if (!document) {
      throw new Error(ERROR_MESSAGES.DOCUMENT_NOT_FOUND);
    }

    // Delete from Cloudinary
    await cloudinaryService.deleteFile(document.publicId);

    // Remove from guide
    const updatedGuide = await guideRepository.removeDocument(
      guide._id,
      documentId
    );

    // Adjust flags based on remaining documents
    const hasTourismCard = updatedGuide.documents.some(
      (doc) =>
        doc.type === DOCUMENT_TYPES.TOURISM_CARD &&
        doc.status === DOCUMENT_STATUS.APPROVED
    );
    const hasApprovedIdDoc = updatedGuide.documents.some(
      (doc) =>
        doc.type === DOCUMENT_TYPES.ID_DOCUMENT &&
        doc.status === DOCUMENT_STATUS.APPROVED
    );

    await guideRepository.findByIdAndUpdate(guide._id, {
      canEnterArchaeologicalSites: hasTourismCard,
      isVerified: hasApprovedIdDoc,
    });

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.DELETE_DOCUMENT,
      resourceType: "document",
      resourceId: guide._id,
      details: { documentId, documentType: document.type },
      ipAddress,
      userAgent,
    });

    return {
      message: SUCCESS_MESSAGES.DOCUMENT_DELETED,
    };
  }

  /**
   * Update guide profile
   */
  async updateProfile(userId, updateData, ipAddress, userAgent) {
    const guide = await guideRepository.findByUserId(userId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    // If toggling isLicensed to true, validate tourism card exists
    if (updateData.isLicensed === true || updateData.isLicensed === "true") {
      const hasTourismCard = guide.documents.some(
        (doc) => doc.type === DOCUMENT_TYPES.TOURISM_CARD
      );
      if (!hasTourismCard) {
        throw new Error(ERROR_MESSAGES.TOURISM_CARD_REQUIRED);
      }
    }

    // Normalize provinces field
    if (updateData.provinces !== undefined) {
      if (updateData.provinces === null || updateData.provinces === "") {
        updateData.provinces = [];
      } else {
        const provincesArray = Array.isArray(updateData.provinces)
          ? updateData.provinces
          : [updateData.provinces];
        updateData.provinces = provincesArray
          .filter(
            (id) =>
              id &&
              typeof id === "string" &&
              mongoose.Types.ObjectId.isValid(id)
          )
          .map((id) => new mongoose.Types.ObjectId(id));
      }
    }

    // Update guide
    const updatedGuide = await guideRepository.findByIdAndUpdate(
      guide._id,
      updateData
    );

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.UPDATE_GUIDE_PROFILE,
      resourceType: "guide",
      resourceId: guide._id,
      details: updateData,
      ipAddress,
      userAgent,
    });

    return {
      message: SUCCESS_MESSAGES.PROFILE_UPDATED,
      guide: updatedGuide,
    };
  }

  /**
   * Get guide profile
   */
  async getGuideProfile(guideId) {
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    return guide;
  }

  /**
   * Get guide documents (owner or admin only)
   */
  async getGuideDocuments(guideId) {
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    return guide.documents;
  }

  /**
   * Search guides with filters
   */
  async searchGuides(filters, options) {
    return await guideRepository.search(filters, options);
  }

  /**
   * Admin: Verify guide documents
   */
  async verifyGuideDocuments(
    guideId,
    documentId,
    status,
    note,
    adminId,
    ipAddress,
    userAgent
  ) {
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    const document = guide.documents.id(documentId);
    if (!document) {
      throw new Error(ERROR_MESSAGES.DOCUMENT_NOT_FOUND);
    }

    // Update document status
    document.status = status;
    document.note = note;

    const updatedGuide = await guideRepository.updateDocument(
      guideId,
      documentId,
      document
    );

    // Update guide verification flags
    const hasApprovedIdDoc = updatedGuide.documents.some(
      (doc) =>
        doc.type === DOCUMENT_TYPES.ID_DOCUMENT &&
        doc.status === DOCUMENT_STATUS.APPROVED
    );
    const hasApprovedTourismCard = updatedGuide.documents.some(
      (doc) =>
        doc.type === DOCUMENT_TYPES.TOURISM_CARD &&
        doc.status === DOCUMENT_STATUS.APPROVED
    );

    await guideRepository.findByIdAndUpdate(guideId, {
      isVerified: hasApprovedIdDoc,
      canEnterArchaeologicalSites: hasApprovedTourismCard,
    });

    // Log audit
    const action =
      status === DOCUMENT_STATUS.APPROVED
        ? AUDIT_ACTIONS.ADMIN_APPROVE_DOCUMENT
        : AUDIT_ACTIONS.ADMIN_REJECT_DOCUMENT;

    await logAudit({
      userId: adminId,
      action,
      resourceType: "document",
      resourceId: guideId,
      details: { documentId, documentType: document.type, status, note },
      ipAddress,
      userAgent,
    });

    // Notify guide
    const user = await userRepository.findById(guide.user._id || guide.user);
    await notificationService.notifyGuideDocumentStatus(
      user,
      document,
      status,
      note
    );

    return {
      message: `Document ${status}`,
      guide: updatedGuide,
    };
  }

  /**
   * Admin: Get all pending guides
   */
  async getPendingGuides(options) {
    return await guideRepository.findAll({ isVerified: false }, options);
  }

  /**
   * Register or update guide profile (idempotent for Task 2)
   */
  async registerOrUpdateProfile(userId, profileData) {
    const {
      province,
      provinces,
      name,
      slug,
      languages,
      pricePerHour,
      bio,
      avatar,
      location,
    } = profileData;

    // Validate user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const guideName = name || user.name;

    const guideData = {
      user: userId,
      name: guideName,
      slug:
        slug || (guideName ? guideName.toLowerCase().replace(/\s+/g, "-") : ""),
      languages: Array.isArray(languages) ? languages : [languages],
      pricePerHour: Number(pricePerHour),
      bio,
    };

    // Normalize provinces field
    let normalizedProvinces = [];
    if (provinces !== undefined && provinces !== null && provinces !== "") {
      const provincesArray = Array.isArray(provinces) ? provinces : [provinces];
      normalizedProvinces = provincesArray
        .filter(
          (id) =>
            id && typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
        )
        .map((id) => new mongoose.Types.ObjectId(id));
    }
    guideData.provinces = normalizedProvinces;

    // Handle legacy province field
    if (province && typeof province === "string" && province.length > 0) {
      if (mongoose.Types.ObjectId.isValid(province)) {
        guideData.province = province;
        // Ensure it's in the array
        const provinceObjId = new mongoose.Types.ObjectId(province);
        if (!guideData.provinces || guideData.provinces.length === 0) {
          guideData.provinces = [provinceObjId];
        } else if (!guideData.provinces.some((p) => p.equals(provinceObjId))) {
          guideData.provinces.push(provinceObjId);
        }
      }
    } else if (guideData.provinces && guideData.provinces.length > 0) {
      // If no primary province but we have a list, use the first one
      guideData.province = guideData.provinces[0];
    }
    if (avatar) guideData.avatar = avatar;
    if (location && location.coordinates) {
      guideData.location = {
        type: "Point",
        coordinates: location.coordinates,
      };
    }

    try {
      const guide = await guideRepository.upsertByUserId(userId, guideData);

      return {
        success: true,
        data: guide,
        message: "Guide profile saved successfully",
      };
    } catch (error) {
      console.error("Error in registerOrUpdateProfile:", error);
      throw error;
    }
  }

  /**
   * List guides by province slug with filters
   */
  async listGuidesByProvince(provinceSlug, filters = {}) {
    // Import province repository to get province by slug
    const { default: provinceRepository } = await import(
      "../repositories/provinceRepository.js"
    );

    const province = await provinceRepository.findBySlug(provinceSlug);
    if (!province) {
      throw new Error("Province not found");
    }

    const {
      language,
      maxPrice,
      verified,
      page = 1,
      limit = 20,
      near,
      radius,
      sort = "rating",
    } = filters;

    const skip = (page - 1) * limit;
    const options = { skip, limit };

    // Parse sort
    if (sort === "rating") {
      options.sort = { rating: -1, ratingCount: -1 };
    } else if (sort === "price") {
      options.sort = { pricePerHour: 1 };
    } else if (sort === "distance" && near) {
      // Distance sorting is handled by $nearSphere
      options.sort = {};
    } else {
      options.sort = { createdAt: -1 };
    }

    const queryFilters = {};
    if (language) queryFilters.language = language;
    if (maxPrice) queryFilters.maxPrice = Number(maxPrice);
    if (verified !== undefined)
      queryFilters.verified = verified === "true" || verified === true;

    let guides;
    let total;

    // If near filter is provided, use geospatial query
    if (near && radius) {
      const [lat, lng] = near.split(",").map(Number);
      const maxDistance = Number(radius) || 10000; // default 10km

      guides = await guideRepository.searchNear(
        [lng, lat],
        maxDistance,
        queryFilters,
        options
      );

      total = guides.length; // Approximation for geo queries
    } else {
      guides = await guideRepository.findByProvince(
        province._id,
        queryFilters,
        options
      );
      total = await guideRepository.countDocuments({
        province: province._id,
        ...queryFilters,
      });
    }

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        items: guides,
        page: Number(page),
        limit: Number(limit),
        totalPages,
        totalItems: total,
      },
    };
  }

  /**
   * Get guide details by ID or slug
   */
  async getGuideDetails(identifier) {
    let guide;

    // Try to find by ID first, then by slug
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      guide = await guideRepository.findById(identifier);
    } else {
      guide = await guideRepository.findBySlug(identifier);
    }

    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    // Return public profile (exclude sensitive fields)
    return {
      success: true,
      data: guide,
    };
  }

  /**
   * Upload document for guide (Task 2 version)
   */
  async uploadGuideDocument(userId, guideId, fileMeta) {
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    // Verify ownership
    if (
      guide.user._id.toString() !== userId.toString() &&
      guide.user.toString() !== userId.toString()
    ) {
      throw new Error("Not authorized to upload documents for this guide");
    }

    const documentData = {
      url: fileMeta.url,
      publicId: fileMeta.publicId,
      type: fileMeta.type || "other",
      status: "pending",
      uploadedAt: new Date(),
    };

    const updatedGuide = await guideRepository.addDocument(
      guideId,
      documentData
    );

    return {
      success: true,
      data: updatedGuide,
      message: "Document uploaded successfully",
    };
  }

  /**
   * Set document status (admin only - stub for Task 2)
   */
  async setDocumentStatus(adminUser, guideId, documentId, status) {
    const guide = await guideRepository.findById(guideId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    const document = guide.documents.id(documentId);
    if (!document) {
      throw new Error(ERROR_MESSAGES.DOCUMENT_NOT_FOUND);
    }

    document.status = status;
    const updatedGuide = await guideRepository.updateDocument(
      guideId,
      documentId,
      document
    );

    return {
      success: true,
      data: updatedGuide,
      message: `Document ${status}`,
    };
  }

  /**
   * Upload gallery images for guide
   */
  async uploadGalleryImages(userId, files, ipAddress, userAgent) {
    const guide = await guideRepository.findByUserId(userId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    if (!files || files.length === 0) {
      throw new Error("No images provided");
    }

    const galleryImages = [];
    const galleryFolder = `${CLOUDINARY_FOLDERS.GUIDES}/${userId}/gallery`;

    // Upload each image to Cloudinary
    for (const file of files) {
      const upload = await cloudinaryService.uploadFile(
        file.path,
        galleryFolder
      );
      galleryImages.push({
        url: upload.url,
        publicId: upload.publicId,
        uploadedAt: new Date(),
      });
    }

    // Add images to guide's gallery
    const updatedGuide = await guideRepository.addGalleryImages(
      guide._id,
      galleryImages
    );

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.UPDATE_PROFILE,
      resourceType: "guide",
      resourceId: guide._id,
      details: { galleryImagesAdded: galleryImages.length },
      ipAddress,
      userAgent,
    });

    return {
      message: `${galleryImages.length} image(s) uploaded successfully`,
      data: updatedGuide,
    };
  }

  /**
   * Delete gallery image
   */
  async deleteGalleryImage(userId, imageId, ipAddress, userAgent) {
    const guide = await guideRepository.findByUserId(userId);
    if (!guide) {
      throw new Error(ERROR_MESSAGES.GUIDE_NOT_FOUND);
    }

    const image = guide.gallery.id(imageId);
    if (!image) {
      throw new Error("Gallery image not found");
    }

    // Delete from Cloudinary
    await cloudinaryService.deleteFile(image.publicId);

    // Remove from guide's gallery
    const updatedGuide = await guideRepository.removeGalleryImage(
      guide._id,
      imageId
    );

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.UPDATE_PROFILE,
      resourceType: "guide",
      resourceId: guide._id,
      details: { galleryImageDeleted: imageId },
      ipAddress,
      userAgent,
    });

    return {
      message: "Gallery image deleted successfully",
      data: updatedGuide,
    };
  }
}

export default new GuideService();

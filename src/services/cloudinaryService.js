import cloudinary from '../config/cloudinary.js';

/**
 * Cloudinary Service - Business logic for file upload/delete operations
 */
class CloudinaryService {
  /**
   * Upload file to Cloudinary
   * @param {string} filePath - Local file path or buffer
   * @param {string} folder - Cloudinary folder
   * @param {string} resourceType - 'image', 'raw', or 'auto'
   */
  async uploadFile(filePath, folder, resourceType = 'auto') {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder,
        resource_type: resourceType,
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error('Failed to upload file to cloud storage');
    }
  }

  /**
   * Delete file from Cloudinary
   * @param {string} publicId - Cloudinary public ID
   * @param {string} resourceType - 'image', 'raw', or 'auto'
   */
  async deleteFile(publicId, resourceType = 'auto') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });

      return result;
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new Error('Failed to delete file from cloud storage');
    }
  }

  /**
   * Delete multiple files from Cloudinary
   * @param {string[]} publicIds - Array of Cloudinary public IDs
   */
  async deleteMultipleFiles(publicIds) {
    try {
      const result = await cloudinary.api.delete_resources(publicIds);
      return result;
    } catch (error) {
      console.error('Cloudinary batch delete error:', error);
      throw new Error('Failed to delete files from cloud storage');
    }
  }

  /**
   * Get file info from Cloudinary
   * @param {string} publicId - Cloudinary public ID
   */
  async getFileInfo(publicId) {
    try {
      const result = await cloudinary.api.resource(publicId);
      return result;
    } catch (error) {
      console.error('Cloudinary get file info error:', error);
      return null;
    }
  }
}

export default new CloudinaryService();

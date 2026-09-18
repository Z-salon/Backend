import { cloudinary } from './cloudinary';

class ImageService {
  /**
   * Safely deletes an image from Cloudinary by its publicId.
   * If the deletion fails, it catches the error and logs it to avoid
   * rolling back any prior successful database operations.
   *
   * @param publicId - The Cloudinary publicId of the asset
   */
  async safeDeleteImage(publicId: string | null | undefined): Promise<void> {
    if (!publicId) return;

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result !== 'ok' && result.result !== 'not found') {
        console.warn(`⚠️ Failed to delete Cloudinary asset ${publicId}:`, result);
      }
    } catch (error) {
      console.error(`🚨 Error deleting Cloudinary asset ${publicId}:`, error);
      // We explicitly do NOT throw the error so that the calling transaction/operation can continue
    }
  }
}

export const imageService = new ImageService();

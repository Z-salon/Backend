import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env';

if (config.cloudinaryUrl) {
  // Configures cloudinary based on CLOUDINARY_URL environment variable
  // which is automatically parsed by the cloudinary library
  cloudinary.config({
    secure: true
  });
} else {
  console.warn('⚠️ CLOUDINARY_URL environment variable is missing. Cloudinary integration will be disabled.');
}

export { cloudinary };

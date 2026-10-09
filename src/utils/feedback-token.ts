import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { hashVerificationToken } from '../libs/otp';

/**
 * Derives a deterministic 32-byte AES key from application configuration.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.FEEDBACK_TOKEN_SECRET || process.env.JWT_SECRET || 'z-salon-feedback-secret-default-key-32b';
  return createHash('sha256').update(secret).digest();
}

/**
 * Generate a cryptographically secure, URL-safe feedback token.
 *
 * The raw token is returned to the caller only so it can be embedded in the
 * customer feedback link. It is never persisted in plaintext.
 */
export function generateFeedbackToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a raw feedback token for fast indexed lookups on the public customer endpoint.
 *
 * Reuses the same SHA-256 helper as OTP/invitation tokens so all opaque,
 * single-use tokens in the platform are hashed identically.
 */
export function hashFeedbackToken(token: string): string {
  return hashVerificationToken(token);
}

/**
 * Encrypt a raw feedback token using AES-256-GCM so authorized admins can retrieve
 * the original link later (for QR codes, copy-link) without plaintext storage or token rotation.
 * Format: iv_hex:auth_tag_hex:ciphertext_hex
 */
export function encryptFeedbackToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted token string back to the original raw token.
 */
export function decryptFeedbackToken(encryptedToken: string): string {
  const parts = encryptedToken.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(cipherHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Build the public customer-facing feedback URL from the configured frontend base URL.
 * Never hard-code a production domain.
 */
export function buildFeedbackUrl(frontendBaseUrl: string, token: string): string {
  return `${frontendBaseUrl.replace(/\/$/, '')}/feedback/${token}`;
}

/**
 * Generate a standard QR image URL for sharing the feedback link.
 */
export function buildFeedbackQrUrl(feedbackUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(feedbackUrl)}`;
}

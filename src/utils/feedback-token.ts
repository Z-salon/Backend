import { randomBytes } from 'crypto';
import { hashVerificationToken } from '../libs/otp';

/**
 * Generate a cryptographically secure, URL-safe feedback token.
 *
 * The raw token is returned to the caller only so it can be embedded in the
 * customer feedback link. It is never persisted and must never be logged.
 */
export function generateFeedbackToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a raw feedback token for storage/lookup.
 *
 * Reuses the same SHA-256 helper as OTP/invitation tokens so all opaque,
 * single-use tokens in the platform are hashed identically.
 */
export function hashFeedbackToken(token: string): string {
  return hashVerificationToken(token);
}

/**
 * Build the public customer-facing feedback URL from the configured frontend base URL.
 * Never hard-code a production domain.
 */
export function buildFeedbackUrl(frontendBaseUrl: string, token: string): string {
  return `${frontendBaseUrl.replace(/\/$/, '')}/feedback/${token}`;
}

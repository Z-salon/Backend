import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { verifyCustomerActionToken } from '../../../libs/jwt';

/**
 * Persisted, revocable opaque tokens for the public customer self-service link.
 *
 * Security properties:
 * - 256 bits of CSPRNG entropy, base64url encoded (unguessable).
 * - Only the SHA-256 hash is stored, so a database leak cannot replay tokens and
 *   tokens never appear in logs (callers must not log the raw value).
 * - Bound to exactly one appointment; a token cannot be used to reach another
 *   appointment, business, or branch.
 * - Has an explicit expiry and can be revoked (e.g. on cancellation).
 */

const TOKEN_BYTES = 32;

/** How long after the appointment the self-service link stays usable. */
const TOKEN_GRACE_HOURS = 24;

/** Minimum lifetime so short-notice bookings still get a working link. */
const TOKEN_MIN_LIFETIME_MS = 60 * 60 * 1000;

export type ActionTokenScope = {
  appointmentId: string;
  tokenId: string;
};

export function hashActionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AppointmentActionTokenService {
  private computeExpiry(scheduledEnd: Date): Date {
    const candidate = scheduledEnd.getTime() + TOKEN_GRACE_HOURS * 60 * 60 * 1000;
    const min = Date.now() + TOKEN_MIN_LIFETIME_MS;
    return new Date(Math.max(candidate, min));
  }

  /**
   * Create a new opaque token for an appointment and return the raw value.
   * The raw value is returned exactly once and is never persisted.
   */
  async issueToken(
    tx: Prisma.TransactionClient | typeof prisma,
    appointment: { id: string; businessId: string; scheduledEnd: Date }
  ): Promise<string> {
    const raw = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    await tx.appointmentActionToken.create({
      data: {
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        tokenHash: hashActionToken(raw),
        expiresAt: this.computeExpiry(appointment.scheduledEnd),
      },
    });
    return raw;
  }

  /**
   * Resolve a raw token to its appointment. Accepts legacy JWT action tokens
   * (issued before this change) as a read-only fallback so links already sent to
   * customers keep working. Throws for unknown, revoked, or expired tokens.
   */
  async resolve(token: string): Promise<ActionTokenScope> {
    if (!token || typeof token !== 'string') {
      throw new ApiError(401, 'Invalid action token', ErrorCodes.UNAUTHORIZED);
    }

    const record = await prisma.appointmentActionToken.findUnique({
      where: { tokenHash: hashActionToken(token) },
      select: { id: true, appointmentId: true, expiresAt: true, revokedAt: true },
    });

    if (record) {
      if (record.revokedAt) {
        throw new ApiError(401, 'This link is no longer valid', ErrorCodes.UNAUTHORIZED);
      }
      if (record.expiresAt.getTime() < Date.now()) {
        throw new ApiError(401, 'This link has expired', ErrorCodes.UNAUTHORIZED);
      }
      // Best-effort use tracking; never block the action on it.
      prisma.appointmentActionToken
        .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
      return { appointmentId: record.appointmentId, tokenId: record.id };
    }

    // Legacy fallback: JWT action tokens contain two dots.
    if (token.split('.').length === 3) {
      try {
        const payload = verifyCustomerActionToken(token);
        if (payload?.sub) {
          return { appointmentId: payload.sub, tokenId: 'legacy' };
        }
      } catch {
        // fall through to the generic error
      }
    }

    throw new ApiError(401, 'Invalid action token', ErrorCodes.UNAUTHORIZED);
  }

  /** Revoke every active token for an appointment (used on cancellation). */
  async revokeForAppointment(
    tx: Prisma.TransactionClient | typeof prisma,
    appointmentId: string
  ): Promise<number> {
    const result = await tx.appointmentActionToken.updateMany({
      where: { appointmentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Extend active tokens to cover a new schedule after a reschedule. */
  async extendExpiryForAppointment(
    tx: Prisma.TransactionClient | typeof prisma,
    appointmentId: string,
    scheduledEnd: Date
  ): Promise<number> {
    const expiresAt = this.computeExpiry(scheduledEnd);
    const result = await tx.appointmentActionToken.updateMany({
      where: { appointmentId, revokedAt: null, expiresAt: { lt: expiresAt } },
      data: { expiresAt },
    });
    return result.count;
  }

  /** Housekeeping: drop long-expired tokens. */
  async deleteExpiredTokens(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await prisma.appointmentActionToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return result.count;
  }
}

export const appointmentActionTokenService = new AppointmentActionTokenService();

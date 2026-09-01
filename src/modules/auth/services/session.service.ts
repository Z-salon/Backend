import { prisma } from '../../../libs/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../../libs/jwt';
import { hashOtp } from '../../../libs/otp';
import { randomBytes } from 'crypto';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { config } from '../../../config/env';

export interface SessionData {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export class SessionService {
  async createSession(
    userId: string,
    deviceName?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<SessionData> {
    const sessionId = randomBytes(16).toString('hex');
    const refreshToken = generateRefreshToken(userId, sessionId);
    const refreshTokenHash = hashOtp(refreshToken);
    const accessToken = generateAccessToken(userId, sessionId);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash,
        deviceName,
        userAgent,
        ipAddress,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    return {
      id: sessionId,
      userId,
      accessToken,
      refreshToken,
    };
  }

  async rotateRefreshToken(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    const payload = verifyRefreshToken(refreshToken);

    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      throw new ApiError(401, 'Session not found', ErrorCodes.SESSION_REVOKED);
    }

    if (session.status !== 'ACTIVE') {
      throw new ApiError(401, 'Session has been revoked', ErrorCodes.SESSION_REVOKED);
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      throw new ApiError(401, 'Session has expired', ErrorCodes.SESSION_EXPIRED);
    }

    if (hashOtp(refreshToken) !== session.refreshTokenHash) {
      await this.revokeAllUserSessions(session.userId, 'Refresh token reuse detected');
      throw new ApiError(401, 'Invalid refresh token', ErrorCodes.INVALID_TOKEN);
    }

    const newRefreshToken = generateRefreshToken(session.userId, session.id);
    const newRefreshTokenHash = hashOtp(newRefreshToken);
    const newAccessToken = generateAccessToken(session.userId, session.id);

    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
        userAgent: userAgent || session.userAgent,
        ipAddress: ipAddress || session.ipAddress,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      sessionId: session.id,
    };
  }

  async revokeSession(sessionId: string, userId: string, reason?: string): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new ApiError(404, 'Session not found', ErrorCodes.NOT_FOUND);
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: reason,
      },
    });
  }

  async revokeAllUserSessions(userId: string, reason?: string): Promise<void> {
    await prisma.session.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: reason || 'Logged out from all devices',
      },
    });
  }

  async getUserSessions(userId: string, currentSessionId?: string) {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });

    return sessions.map((session: { id: string | undefined; }) => ({
      ...session,
      currentSession: session.id === currentSessionId,
    }));
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
    await prisma.session.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
        id: { not: currentSessionId },
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: 'Revoked from another session',
      },
    });
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: {
        status: 'EXPIRED',
      },
    });
    return result.count;
  }
}

export const sessionService = new SessionService();
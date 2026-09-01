"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionService = exports.SessionService = void 0;
const prisma_1 = require("../../../libs/prisma");
const jwt_1 = require("../../../libs/jwt");
const otp_1 = require("../../../libs/otp");
const crypto_1 = require("crypto");
const api_error_1 = require("../../../utils/api-error");
class SessionService {
    createSession(userId, deviceName, userAgent, ipAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessionId = (0, crypto_1.randomBytes)(16).toString('hex');
            const refreshToken = (0, jwt_1.generateRefreshToken)(userId, sessionId);
            const refreshTokenHash = (0, otp_1.hashOtp)(refreshToken);
            const accessToken = (0, jwt_1.generateAccessToken)(userId, sessionId);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
            yield prisma_1.prisma.session.create({
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
        });
    }
    rotateRefreshToken(refreshToken, userAgent, ipAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
            const session = yield prisma_1.prisma.session.findUnique({
                where: { id: payload.sessionId },
            });
            if (!session) {
                throw new api_error_1.ApiError(401, 'Session not found', api_error_1.ErrorCodes.SESSION_REVOKED);
            }
            if (session.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(401, 'Session has been revoked', api_error_1.ErrorCodes.SESSION_REVOKED);
            }
            if (session.expiresAt < new Date()) {
                yield prisma_1.prisma.session.update({
                    where: { id: session.id },
                    data: { status: 'EXPIRED' },
                });
                throw new api_error_1.ApiError(401, 'Session has expired', api_error_1.ErrorCodes.SESSION_EXPIRED);
            }
            if ((0, otp_1.hashOtp)(refreshToken) !== session.refreshTokenHash) {
                yield this.revokeAllUserSessions(session.userId, 'Refresh token reuse detected');
                throw new api_error_1.ApiError(401, 'Invalid refresh token', api_error_1.ErrorCodes.INVALID_TOKEN);
            }
            const newRefreshToken = (0, jwt_1.generateRefreshToken)(session.userId, session.id);
            const newRefreshTokenHash = (0, otp_1.hashOtp)(newRefreshToken);
            const newAccessToken = (0, jwt_1.generateAccessToken)(session.userId, session.id);
            yield prisma_1.prisma.session.update({
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
        });
    }
    revokeSession(sessionId, userId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield prisma_1.prisma.session.findUnique({
                where: { id: sessionId },
            });
            if (!session || session.userId !== userId) {
                throw new api_error_1.ApiError(404, 'Session not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            yield prisma_1.prisma.session.update({
                where: { id: sessionId },
                data: {
                    status: 'REVOKED',
                    revokedAt: new Date(),
                    revokeReason: reason,
                },
            });
        });
    }
    revokeAllUserSessions(userId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.session.updateMany({
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
        });
    }
    getUserSessions(userId, currentSessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessions = yield prisma_1.prisma.session.findMany({
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
            return sessions.map((session) => (Object.assign(Object.assign({}, session), { currentSession: session.id === currentSessionId })));
        });
    }
    revokeOtherSessions(userId, currentSessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.session.updateMany({
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
        });
    }
    cleanupExpiredSessions() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield prisma_1.prisma.session.updateMany({
                where: {
                    status: 'ACTIVE',
                    expiresAt: { lt: new Date() },
                },
                data: {
                    status: 'EXPIRED',
                },
            });
            return result.count;
        });
    }
}
exports.SessionService = SessionService;
exports.sessionService = new SessionService();

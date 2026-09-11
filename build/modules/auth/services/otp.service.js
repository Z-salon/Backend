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
exports.otpService = exports.OtpService = void 0;
const prisma_1 = require("../../../libs/prisma");
const otp_1 = require("../../../libs/otp");
const sms_service_1 = require("../sms/sms.service");
const phone_1 = require("../../../utils/phone");
const api_error_1 = require("../../../utils/api-error");
const env_1 = require("../../../config/env");
class OtpService {
    requestOtp(phone, purpose, ip, userAgent) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(phone);
            yield this.checkRateLimits(normalizedPhone, ip);
            yield this.checkResendCooldown(normalizedPhone, purpose);
            const { otp, otpHash } = (0, otp_1.generateOtp)();
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + env_1.config.otp.expiresInMinutes);
            yield prisma_1.prisma.otpChallenge.create({
                data: {
                    phone: normalizedPhone,
                    purpose,
                    otpHash,
                    maxAttempts: env_1.config.otp.maxAttempts,
                    expiresAt,
                    requestIp: ip,
                    userAgent,
                },
            });
            yield (0, sms_service_1.sendOtpSms)(normalizedPhone, otp);
            yield this.incrementRateLimitCounters(normalizedPhone, ip);
        });
    }
    verifyOtp(phone, otp, purpose) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(phone);
            const challenge = yield prisma_1.prisma.otpChallenge.findFirst({
                where: {
                    phone: normalizedPhone,
                    purpose,
                    status: 'PENDING',
                },
                orderBy: { createdAt: 'desc' },
            });
            if (!challenge) {
                throw new api_error_1.ApiError(400, 'No valid OTP challenge found', api_error_1.ErrorCodes.OTP_INVALID);
            }
            if (challenge.expiresAt < new Date()) {
                yield prisma_1.prisma.otpChallenge.update({
                    where: { id: challenge.id },
                    data: { status: 'EXPIRED' },
                });
                throw new api_error_1.ApiError(400, 'OTP has expired', api_error_1.ErrorCodes.OTP_EXPIRED);
            }
            if (challenge.attemptCount >= challenge.maxAttempts) {
                yield prisma_1.prisma.otpChallenge.update({
                    where: { id: challenge.id },
                    data: { status: 'LOCKED' },
                });
                throw new api_error_1.ApiError(400, 'Maximum OTP attempts exceeded', api_error_1.ErrorCodes.OTP_MAX_ATTEMPTS);
            }
            const isValid = (0, otp_1.verifyOtp)(otp, challenge.otpHash);
            if (!isValid) {
                yield prisma_1.prisma.otpChallenge.update({
                    where: { id: challenge.id },
                    data: { attemptCount: { increment: 1 } },
                });
                throw new api_error_1.ApiError(400, 'Invalid OTP', api_error_1.ErrorCodes.OTP_INVALID);
            }
            const verificationToken = (0, otp_1.generateVerificationToken)();
            const verificationTokenHash = (0, otp_1.hashVerificationToken)(verificationToken);
            yield prisma_1.prisma.otpChallenge.update({
                where: { id: challenge.id },
                data: {
                    status: 'VERIFIED',
                    verifiedAt: new Date(),
                    consumedAt: new Date(),
                    verificationTokenHash,
                },
            });
            return verificationToken;
        });
    }
    consumeVerificationToken(verificationToken, expectedPurpose) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenHash = (0, otp_1.hashVerificationToken)(verificationToken);
            const challenge = yield prisma_1.prisma.otpChallenge.findFirst({
                where: {
                    verificationTokenHash: tokenHash,
                    status: 'VERIFIED',
                },
                orderBy: { verifiedAt: 'desc' },
            });
            if (!challenge) {
                throw new api_error_1.ApiError(400, 'Invalid or expired verification token', api_error_1.ErrorCodes.OTP_INVALID);
            }
            if (expectedPurpose && challenge.purpose !== expectedPurpose) {
                throw new api_error_1.ApiError(400, 'Invalid or expired verification token', api_error_1.ErrorCodes.OTP_INVALID);
            }
            if (challenge.verifiedAt) {
                const tokenExpiresAt = new Date(challenge.verifiedAt.getTime() + env_1.config.otp.expiresInMinutes * 60 * 1000);
                if (tokenExpiresAt < new Date()) {
                    yield prisma_1.prisma.otpChallenge.update({
                        where: { id: challenge.id },
                        data: { status: 'EXPIRED' },
                    });
                    throw new api_error_1.ApiError(400, 'OTP verification has expired', api_error_1.ErrorCodes.OTP_EXPIRED);
                }
            }
            yield prisma_1.prisma.otpChallenge.update({
                where: { id: challenge.id },
                data: { status: 'CONSUMED' },
            });
            return {
                phone: challenge.phone,
                purpose: challenge.purpose,
            };
        });
    }
    checkRateLimits(phone, ip) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const [ipCount, phoneCount] = yield Promise.all([
                prisma_1.prisma.$queryRaw `SELECT COUNT(*)::int as count FROM "OtpChallenge" WHERE "requestIp" = ${ip} AND "createdAt" > NOW() - INTERVAL '${env_1.config.otp.rateLimit.ip.windowMinutes} minutes'`,
                prisma_1.prisma.$queryRaw `SELECT COUNT(*)::int as count FROM "OtpChallenge" WHERE "phone" = ${phone} AND "createdAt" > NOW() - INTERVAL '${env_1.config.otp.rateLimit.phone.windowMinutes} minutes'`,
            ]);
            if (ip && Array.isArray(ipCount) && ((_a = ipCount[0]) === null || _a === void 0 ? void 0 : _a.count) >= env_1.config.otp.rateLimit.ip.max) {
                throw new api_error_1.ApiError(429, 'IP rate limit exceeded', api_error_1.ErrorCodes.OTP_RATE_LIMITED);
            }
            if (Array.isArray(phoneCount) && ((_b = phoneCount[0]) === null || _b === void 0 ? void 0 : _b.count) >= env_1.config.otp.rateLimit.phone.max) {
                throw new api_error_1.ApiError(429, 'Phone rate limit exceeded', api_error_1.ErrorCodes.OTP_RATE_LIMITED);
            }
        });
    }
    checkResendCooldown(phone, purpose) {
        return __awaiter(this, void 0, void 0, function* () {
            const recentChallenge = yield prisma_1.prisma.otpChallenge.findFirst({
                where: {
                    phone,
                    purpose: purpose,
                    createdAt: {
                        gt: new Date(Date.now() - env_1.config.otp.resendCooldownSeconds * 1000),
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            if (recentChallenge) {
                throw new api_error_1.ApiError(429, 'Please wait before requesting another OTP', api_error_1.ErrorCodes.OTP_RESEND_COOLDOWN);
            }
        });
    }
    incrementRateLimitCounters(phone, ip) {
        return __awaiter(this, void 0, void 0, function* () {
            // Rate limiting is handled by the database queries in checkRateLimits
            // This is just a placeholder for any additional logic
        });
    }
}
exports.OtpService = OtpService;
exports.otpService = new OtpService();

import { prisma } from '../../../libs/prisma';
import { generateOtp, hashOtp, generateVerificationToken, hashVerificationToken, verifyOtp } from '../../../libs/otp';
import { sendOtpSms } from '../sms/sms.service';
import { normalizePhone } from '../../../utils/phone';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { config } from '../../../config/env';

export class OtpService {
  async requestOtp(
    phone: string,
    purpose: 'LOGIN' | 'REGISTRATION' | 'INVITATION_ACCEPTANCE' | 'PHONE_CHANGE',
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    const normalizedPhone = normalizePhone(phone);

    await this.checkRateLimits(normalizedPhone, ip);
    await this.checkResendCooldown(normalizedPhone, purpose);

    const { otp, otpHash } = generateOtp();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + config.otp.expiresInMinutes);

    await prisma.otpChallenge.create({
      data: {
        phone: normalizedPhone,
        purpose,
        otpHash,
        maxAttempts: config.otp.maxAttempts,
        expiresAt,
        requestIp: ip,
        userAgent,
      },
    });

    await sendOtpSms(normalizedPhone, otp);

    await this.incrementRateLimitCounters(normalizedPhone, ip);
  }

  async verifyOtp(
    phone: string,
    otp: string,
    purpose: 'LOGIN' | 'REGISTRATION' | 'INVITATION_ACCEPTANCE' | 'PHONE_CHANGE'
  ): Promise<string> {
    const normalizedPhone = normalizePhone(phone);

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        phone: normalizedPhone,
        purpose,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new ApiError(400, 'No valid OTP challenge found', ErrorCodes.OTP_INVALID);
    }

    if (challenge.expiresAt < new Date()) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });
      throw new ApiError(400, 'OTP has expired', ErrorCodes.OTP_EXPIRED);
    }

    if (challenge.attemptCount >= challenge.maxAttempts) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'LOCKED' },
      });
      throw new ApiError(400, 'Maximum OTP attempts exceeded', ErrorCodes.OTP_MAX_ATTEMPTS);
    }

    const isValid = verifyOtp(otp, challenge.otpHash);

    if (!isValid) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attemptCount: { increment: 1 } },
      });
      throw new ApiError(400, 'Invalid OTP', ErrorCodes.OTP_INVALID);
    }

    const verificationToken = generateVerificationToken();
    const verificationTokenHash = hashVerificationToken(verificationToken);

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        consumedAt: new Date(),
      },
    });

    return verificationToken;
  }

  async consumeVerificationToken(
    verificationToken: string
  ): Promise<{ phone: string; purpose: string }> {
    const tokenHash = hashVerificationToken(verificationToken);

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        status: 'VERIFIED',
        consumedAt: { not: null },
      },
      orderBy: { verifiedAt: 'desc' },
    });

    if (!challenge) {
      throw new ApiError(400, 'Invalid or expired verification token', ErrorCodes.OTP_INVALID);
    }

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { status: 'CONSUMED' },
    });

    return {
      phone: challenge.phone,
      purpose: challenge.purpose,
    };
  }

  private async checkRateLimits(phone: string, ip?: string): Promise<void> {
    const [ipCount, phoneCount] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "OtpChallenge" WHERE "requestIp" = ${ip} AND "createdAt" > NOW() - INTERVAL '${config.otp.rateLimit.ip.windowMinutes} minutes'`,
      prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "OtpChallenge" WHERE "phone" = ${phone} AND "createdAt" > NOW() - INTERVAL '${config.otp.rateLimit.phone.windowMinutes} minutes'`,
    ]);

    if (ip && Array.isArray(ipCount) && ipCount[0]?.count >= config.otp.rateLimit.ip.max) {
      throw new ApiError(429, 'IP rate limit exceeded', ErrorCodes.OTP_RATE_LIMITED);
    }

    if (Array.isArray(phoneCount) && phoneCount[0]?.count >= config.otp.rateLimit.phone.max) {
      throw new ApiError(429, 'Phone rate limit exceeded', ErrorCodes.OTP_RATE_LIMITED);
    }
  }

  private async checkResendCooldown(phone: string, purpose: string): Promise<void> {
    const recentChallenge = await prisma.otpChallenge.findFirst({
      where: {
        phone,
        purpose: purpose as any,
        createdAt: {
          gt: new Date(Date.now() - config.otp.resendCooldownSeconds * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChallenge) {
      throw new ApiError(429, 'Please wait before requesting another OTP', ErrorCodes.OTP_RESEND_COOLDOWN);
    }
  }

  private async incrementRateLimitCounters(phone: string, ip?: string): Promise<void> {
    // Rate limiting is handled by the database queries in checkRateLimits
    // This is just a placeholder for any additional logic
  }
}

export const otpService = new OtpService();
import argon2 from 'argon2';
import { prisma } from '../../../libs/prisma';
import { otpService } from './otp.service';
import { sessionService } from './session.service';
import { normalizePhone } from '../../../utils/phone';
import { hashVerificationToken } from '../../../libs/otp';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { config } from '../../../config/env';

export interface RegisterData {
  phone: string;
  password: string;
  business: {
    name: string;
    currency: string;
    timezone: string;
  };
}

export interface AuthResult {
  user: {
    id: string;
    phone: string;
    phoneVerifiedAt: Date | null;
  };
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  async register(data: RegisterData): Promise<void> {
    const normalizedPhone = normalizePhone(data.phone);

    const existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingUser) {
      throw new ApiError(409, 'User already exists', ErrorCodes.USER_ALREADY_EXISTS);
    }

    const passwordHash = await argon2.hash(data.password);

    await prisma.registrationRequest.upsert({
      where: { phone: normalizedPhone },
      update: {
        passwordHash,
        businessName: data.business.name,
        currency: data.business.currency,
        timezone: data.business.timezone,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      create: {
        phone: normalizedPhone,
        passwordHash,
        businessName: data.business.name,
        currency: data.business.currency,
        timezone: data.business.timezone,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await otpService.requestOtp(normalizedPhone, 'PHONE_VERIFICATION');
  }

  async registerVerify(phone: string, otp: string, deviceInfo?: { deviceName?: string; userAgent?: string; ipAddress?: string }): Promise<AuthResult> {
    const normalizedPhone = normalizePhone(phone);

    const registrationRequest = await prisma.registrationRequest.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!registrationRequest) {
      throw new ApiError(400, 'Registration request not found', ErrorCodes.BAD_REQUEST);
    }

    const verificationToken = await otpService.verifyOtp(normalizedPhone, otp, 'PHONE_VERIFICATION');
    if (!verificationToken) {
      throw new ApiError(400, 'Invalid or expired verification token', ErrorCodes.OTP_INVALID);
    }

    return prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { phone: normalizedPhone },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            phone: normalizedPhone,
            passwordHash: registrationRequest.passwordHash,
            phoneVerifiedAt: new Date(),
            status: 'ACTIVE',
          },
        });
      }

      if (user.status !== 'ACTIVE') {
        throw new ApiError(403, 'User account is suspended', ErrorCodes.USER_SUSPENDED);
      }

      const business = await tx.business.create({
        data: {
          name: registrationRequest.businessName,
          currency: registrationRequest.currency,
          timezone: registrationRequest.timezone,
          status: 'ACTIVE',
        },
      });

      await tx.branch.create({
        data: {
          businessId: business.id,
          name: 'Main Branch',
          isActive: true,
        },
      });

      const member = await tx.businessMember.create({
        data: {
          businessId: business.id,
          userId: user.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      await this.createDefaultRolesAndPermissions(tx, business.id, member.id);
      await tx.registrationRequest.delete({ where: { id: registrationRequest.id } });

      const session = await sessionService.createSession(
        user.id,
        deviceInfo?.deviceName,
        deviceInfo?.userAgent,
        deviceInfo?.ipAddress
      );

      return {
        user: {
          id: user.id,
          phone: user.phone,
          phoneVerifiedAt: user.phoneVerifiedAt,
        },
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      };
    });
  }

  async login(phone: string, password: string, deviceInfo?: { deviceName?: string; userAgent?: string; ipAddress?: string }): Promise<AuthResult> {
    const normalizedPhone = normalizePhone(phone);

    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user || !user.passwordHash) {
      throw new ApiError(401, 'Invalid phone number or password.', ErrorCodes.INVALID_CREDENTIALS);
    }

    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'User account is suspended', ErrorCodes.USER_SUSPENDED);
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);

    if (!passwordValid) {
      throw new ApiError(401, 'Invalid phone number or password.', ErrorCodes.INVALID_CREDENTIALS);
    }

    const session = await sessionService.createSession(
      user.id,
      deviceInfo?.deviceName,
      deviceInfo?.userAgent,
      deviceInfo?.ipAddress
    );

    return {
      user: {
        id: user.id,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async loginComplete(verificationToken: string, deviceInfo?: { deviceName?: string; userAgent?: string; ipAddress?: string }): Promise<AuthResult> {
    const tokenHash = hashVerificationToken(verificationToken);

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        purpose: 'LOGIN',
        status: 'VERIFIED',
      },
      orderBy: { verifiedAt: 'desc' },
    });

    if (!challenge || hashVerificationToken(verificationToken) !== challenge.verificationTokenHash) {
      throw new ApiError(400, 'Invalid or expired verification token', ErrorCodes.OTP_INVALID);
    }

    const user = await prisma.user.findUnique({
      where: { phone: challenge.phone },
    });

    if (!user) {
      throw new ApiError(404, 'User not found', ErrorCodes.USER_NOT_FOUND);
    }

    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'User account is suspended', ErrorCodes.USER_SUSPENDED);
    }

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { status: 'CONSUMED' },
    });

    const session = await sessionService.createSession(
      user.id,
      deviceInfo?.deviceName,
      deviceInfo?.userAgent,
      deviceInfo?.ipAddress
    );

    return {
      user: {
        id: user.id,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async requestPasswordReset(phone: string): Promise<{ message: string }> {
    const normalizedPhone = normalizePhone(phone);
    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (user) {
      await otpService.requestOtp(normalizedPhone, 'PASSWORD_RESET');
    }

    return {
      message: 'If an account exists, a verification code has been sent.',
    };
  }

  async verifyPasswordReset(phone: string, otp: string): Promise<{ passwordResetToken: string }> {
    const normalizedPhone = normalizePhone(phone);
    const passwordResetToken = await otpService.verifyOtp(normalizedPhone, otp, 'PASSWORD_RESET');

    return {
      passwordResetToken,
    };
  }

  async resetPassword(passwordResetToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashVerificationToken(passwordResetToken);
    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        purpose: 'PASSWORD_RESET',
        status: 'VERIFIED',
        verificationTokenHash: tokenHash,
      },
      orderBy: { verifiedAt: 'desc' },
    });

    if (!challenge) {
      throw new ApiError(400, 'Invalid or expired password reset token', ErrorCodes.OTP_INVALID);
    }

    const user = await prisma.user.findUnique({
      where: { phone: challenge.phone },
    });

    if (!user) {
      throw new ApiError(404, 'User not found', ErrorCodes.USER_NOT_FOUND);
    }

    const passwordHash = await argon2.hash(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      });

      await tx.session.updateMany({
        where: {
          userId: user.id,
          status: 'ACTIVE',
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokeReason: 'Password reset completed',
        },
      });
    });
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        phoneVerifiedAt: true,
        status: true,
        createdAt: true,
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            business: {
              select: { id: true, name: true, currency: true, timezone: true, status: true },
            },
            userRoles: {
              include: {
                role: { select: { id: true, name: true, systemKey: true } },
                branches: { select: { branchId: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, 'User not found', ErrorCodes.USER_NOT_FOUND);
    }

    return user;
  }

  private async createDefaultRolesAndPermissions(
    tx: any,
    businessId: string,
    ownerMemberId: string
  ): Promise<void> {
    const permissions = await tx.permission.findMany({
      select: { id: true, code: true },
    });

    const permissionMap = new Map<string, string>(permissions.map((p: { code: string; id: string }) => [p.code, p.id]));
    const allPermissionCodes = Array.from(permissionMap.keys());

    const defaultRoles = [
      { name: 'Owner', systemKey: 'OWNER', description: 'Business owner with full access', permissionCodes: allPermissionCodes },
      { name: 'Admin', systemKey: 'ADMIN', description: 'Business administrator', permissionCodes: allPermissionCodes.filter((c: string) => !['FINANCE_REFUND', 'FINANCE_ADJUSTMENT'].includes(c)) },
      { name: 'Branch Manager', systemKey: 'BRANCH_MANAGER', description: 'Manages a specific branch', permissionCodes: [
        'BOOKING_VIEW', 'BOOKING_CREATE', 'BOOKING_UPDATE', 'BOOKING_CANCEL', 'BOOKING_CHECK_IN',
        'BOOKING_START', 'BOOKING_COMPLETE', 'BOOKING_MARK_NO_SHOW', 'BOOKING_MANAGE_WAITLIST',
        'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE',
        'STAFF_VIEW', 'STAFF_MANAGE_SCHEDULE',
        'SERVICE_VIEW',
        'BRANCH_VIEW',
        'FINANCE_VIEW',
      ]},
      { name: 'Receptionist', systemKey: 'RECEPTIONIST', description: 'Front desk receptionist', permissionCodes: [
        'BOOKING_VIEW', 'BOOKING_CREATE', 'BOOKING_UPDATE', 'BOOKING_CANCEL', 'BOOKING_CHECK_IN',
        'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE',
        'SERVICE_VIEW',
        'STAFF_VIEW',
      ]},
    ];

    const createdRoles = [];

    for (const roleData of defaultRoles) {
      const role = await tx.role.create({
        data: {
          businessId,
          name: roleData.name,
          description: roleData.description,
          type: 'SYSTEM',
          systemKey: roleData.systemKey,
          isActive: true,
        },
      });

      const permissionIds = roleData.permissionCodes
        .map(code => permissionMap.get(code))
        .filter((id): id is string => id !== undefined);

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map(permissionId => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }

      createdRoles.push({ role, systemKey: roleData.systemKey });
    }

    const ownerRole = createdRoles.find(r => r.systemKey === 'OWNER')!.role;

    await tx.userRole.create({
      data: {
        businessMemberId: ownerMemberId,
        roleId: ownerRole.id,
        scopeType: 'BUSINESS',
      },
    });
  }
}

export const authService = new AuthService();
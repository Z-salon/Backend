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

async registerInvitation(
  invitationToken: string,
  data: {
    password: string;
  }
): Promise<{
  message: string;
  phone: string;
}> {

  // ============================================================
  // 1. Validate password
  // ============================================================

  if (
    !data.password ||
    data.password.length < 8
  ) {

    throw new ApiError(
      400,
      'Password must be at least 8 characters long',
      ErrorCodes.BAD_REQUEST
    );

  }


  // ============================================================
  // 2. Hash invitation token
  // ============================================================

  const tokenHash =
    hashVerificationToken(
      invitationToken
    );


  // ============================================================
  // 3. Find invitation
  // ============================================================

  const invitation =
    await prisma.businessInvitation.findUnique({

      where: {
        tokenHash,
      },

      select: {

        id: true,

        phone: true,

        status: true,

        expiresAt: true,

        business: {
          select: {
            id: true,
            status: true,
          },
        },

      },

    });


  // ============================================================
  // 4. Invitation not found
  // ============================================================

  if (!invitation) {

    throw new ApiError(
      404,
      'Invitation not found',
      ErrorCodes.INVITATION_NOT_FOUND
    );

  }


  // ============================================================
  // 5. Invitation status
  // ============================================================

  if (
    invitation.status ===
    'ACCEPTED'
  ) {

    throw new ApiError(
      409,
      'This invitation has already been accepted',
      ErrorCodes.CONFLICT
    );

  }


  if (
    invitation.status ===
    'REVOKED'
  ) {

    throw new ApiError(
      410,
      'This invitation has been revoked',
      ErrorCodes.INVITATION_REVOKED
    );

  }





  // ============================================================
  // 6. Expiration
  // ============================================================

  if (
    invitation.expiresAt <=
    new Date()
  ) {

    if (
      invitation.status ===
      'PENDING'
    ) {

      await prisma.businessInvitation.update({

        where: {
          id:
            invitation.id,
        },

        data: {
          status:
            'EXPIRED',
        },

      });

    }


    throw new ApiError(
      410,
      'Invitation has expired',
      ErrorCodes.INVITATION_EXPIRED
    );

  }


  // ============================================================
  // 7. Business must still be active
  // ============================================================

  if (
    invitation.business.status !==
    'ACTIVE'
  ) {

    throw new ApiError(
      403,
      'Business is no longer active',
      ErrorCodes.BUSINESS_SUSPENDED
    );

  }


  // ============================================================
  // 8. Phone comes ONLY from invitation
  // ============================================================

  const normalizedPhone =
    normalizePhone(
      invitation.phone
    );


  // ============================================================
  // 9. Check whether user already exists
  // ============================================================

  const existingUser =
    await prisma.user.findUnique({

      where: {
        phone:
          normalizedPhone,
      },

      select: {
        id: true,
        status: true,
      },

    });


  if (existingUser) {

    throw new ApiError(
      409,
      'An account already exists for this invitation. Please log in to accept the invitation.',
      ErrorCodes.USER_ALREADY_EXISTS
    );

  }


  // ============================================================
  // 10. Hash password
  // ============================================================

  const passwordHash =
    await argon2.hash(
      data.password
    );


  // ============================================================
  // 11. Create user + request OTP
  // ============================================================

  //
  // IMPORTANT:
  // Do not put otpService.requestOtp()
  // inside a Prisma transaction if it sends SMS.
  //

  await prisma.user.create({

    data: {

      phone:
        normalizedPhone,

      passwordHash,

      status:
        'PENDING_VERIFICATION',

    },

  });


  // ============================================================
  // 12. Request OTP
  // ============================================================

  await otpService.requestOtp(
    normalizedPhone,
    'PHONE_VERIFICATION'
  );


  // ============================================================
  // 13. Return
  // ============================================================

  return {

    message:
      'Registration started. Please verify your phone number using the OTP.',

    phone:
      normalizedPhone,

  };

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

    // const result = await prisma.$transaction(async (tx) => {
    let user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          passwordHash: registrationRequest.passwordHash,
          phoneVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });
    } else if (user.status === 'PENDING_VERIFICATION') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: registrationRequest.passwordHash,
          phoneVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });
    }

    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'User account is suspended', ErrorCodes.USER_SUSPENDED);
    }

    const slug = registrationRequest.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      + '-' + Date.now().toString(36);

    const business = await prisma.business.create({
      data: {
        name: registrationRequest.businessName,
        slug,
        currency: registrationRequest.currency,
        timezone: registrationRequest.timezone,
        status: 'ACTIVE',
        owner_id: user.id,
      },
    });

    await prisma.branch.create({
      data: {
        businessId: business.id,
        name: 'Main Branch',
        isActive: true,
      },
    });

    const member = await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: user.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });




    // return {
    //   user: {
    //     id: user.id,
    //     phone: user.phone,
    //     phoneVerifiedAt: user.phoneVerifiedAt,
    //   },
    //   memberId: member.id,
    //   businessId: business.id,
    // };
    // );

    await this.createDefaultRolesAndPermissions(prisma, business.id, member.id);

    await prisma.registrationRequest.delete({ where: { id: registrationRequest.id } });

    const session = await sessionService.createSession(
      user.id,
      deviceInfo?.deviceName,
      deviceInfo?.userAgent,
      deviceInfo?.ipAddress
    );

    return {
      user: user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async login(phone: string, password: string, deviceInfo?: { deviceName?: string; userAgent?: string; ipAddress?: string }): Promise<AuthResult> {
    const normalizedPhone = normalizePhone(phone);

    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user || !user.passwordHash) {
      throw new ApiError(401, 'Invalid phone number or password.', ErrorCodes.INVALID_CREDENTIALS);
    }

    if (
      user.status === 'PENDING_VERIFICATION'
    ) {
      throw new ApiError(
        403,
        'Please verify your phone number before logging in',
        ErrorCodes.PHONE_NOT_VERIFIED
      );
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

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.passwordHash) {
      throw new ApiError(401, 'Current password is invalid.', ErrorCodes.INVALID_CREDENTIALS);
    }

    const currentPasswordValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!currentPasswordValid) {
      throw new ApiError(401, 'Current password is invalid.', ErrorCodes.INVALID_CREDENTIALS);
    }

    const passwordHash = await argon2.hash(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      await tx.session.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokeReason: 'Password changed on another device',
        },
      });
    });
  }

  async changePhoneRequest(userId: string, currentPassword: string, newPhone: string): Promise<void> {
    const normalizedPhone = normalizePhone(newPhone);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.passwordHash) {
      throw new ApiError(401, 'Current password is invalid.', ErrorCodes.INVALID_CREDENTIALS);
    }

    const isValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!isValid) {
      throw new ApiError(401, 'Current password is invalid.', ErrorCodes.INVALID_CREDENTIALS);
    }

    const duplicateUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (duplicateUser && duplicateUser.id !== userId) {
      throw new ApiError(409, 'Phone number is already in use.', ErrorCodes.USER_ALREADY_EXISTS);
    }

    await otpService.requestOtp(normalizedPhone, 'PHONE_CHANGE');
  }

  async changePhoneVerify(userId: string, newPhone: string, otp: string): Promise<void> {
    const normalizedPhone = normalizePhone(newPhone);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new ApiError(404, 'User not found', ErrorCodes.USER_NOT_FOUND);
    }

    await otpService.verifyOtp(normalizedPhone, otp, 'PHONE_CHANGE');

    await prisma.user.update({
      where: { id: userId },
      data: {
        phone: normalizedPhone,
        phoneVerifiedAt: new Date(),
      },
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

    // Get seeded permissions
    const permissions = await tx.permission.findMany({
      select: {
        id: true,
        code: true,
      },
    });

    const permissionMap = new Map<string, string>(
      permissions.map((p: { code: string; id: string }) => [
        p.code,
        p.id,
      ])
    );

    const allPermissionCodes = Array.from(permissionMap.keys());


    // ==========================================
    // DEFAULT BUSINESS ROLES
    // ==========================================

    const defaultRoles = [
      {
        name: 'Owner',
        systemKey: 'OWNER',
        description: 'Business owner with full access',
        permissionCodes: allPermissionCodes,
      },

      {
        name: 'Admin',
        systemKey: 'ADMIN',
        description: 'Business administrator',
        permissionCodes: allPermissionCodes.filter(
          (code: string) =>
            ![
              'FINANCE_REFUND',
              'FINANCE_ADJUSTMENT',
            ].includes(code)
        ),
      },

      {
        name: 'Branch Manager',
        systemKey: 'BRANCH_MANAGER',
        description: 'Manages a specific branch',
        permissionCodes: [
          'BOOKING_VIEW',
          'BOOKING_CREATE',
          'BOOKING_UPDATE',
          'BOOKING_CANCEL',
          'BOOKING_CHECK_IN',
          'BOOKING_START',
          'BOOKING_COMPLETE',
          'BOOKING_MARK_NO_SHOW',
          'BOOKING_MANAGE_WAITLIST',

          'CUSTOMER_VIEW',
          'CUSTOMER_CREATE',
          'CUSTOMER_UPDATE',

          'STAFF_VIEW',
          'STAFF_MANAGE_SCHEDULE',

          'SERVICE_VIEW',

          'BRANCH_VIEW',

          'FINANCE_VIEW',
        ],
      },

      {
        name: 'Receptionist',
        systemKey: 'RECEPTIONIST',
        description: 'Front desk receptionist',
        permissionCodes: [
          'BOOKING_VIEW',
          'BOOKING_CREATE',
          'BOOKING_UPDATE',
          'BOOKING_CANCEL',
          'BOOKING_CHECK_IN',

          'CUSTOMER_VIEW',
          'CUSTOMER_CREATE',
          'CUSTOMER_UPDATE',

          'SERVICE_VIEW',

          'STAFF_VIEW',
        ],
      },
    ];


    // ==========================================
    // CREATE ROLES + PERMISSIONS
    // ==========================================

    const createdRoles: {
      role: { id: string };
      systemKey: string;
    }[] = [];


    for (const roleData of defaultRoles) {

      // 1. Create role
      const role = await tx.role.upsert({
        where: {
          businessId_systemKey: {
            businessId,
            systemKey: roleData.systemKey,
          },
        },

        update: {
          name: roleData.name,
          description: roleData.description,
          type: 'SYSTEM',
          isActive: true,
        },

        create: {
          businessId,
          name: roleData.name,
          description: roleData.description,
          type: 'SYSTEM',
          systemKey: roleData.systemKey,
          isActive: true,
        },
      });


      // 2. Validate permissions
      const missingPermissions = roleData.permissionCodes.filter(
        (code) => !permissionMap.has(code)
      );

      if (missingPermissions.length > 0) {
        throw new Error(
          `Missing permissions for role ${roleData.systemKey}: ` +
          missingPermissions.join(', ')
        );
      }


      // 3. Convert codes to IDs
      const permissionIds = roleData.permissionCodes.map(
        (code) => permissionMap.get(code)!
      );


      // 4. Insert relationships in ONE query
      if (permissionIds.length > 0) {

        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),

          skipDuplicates: true,
        });
      }


      createdRoles.push({
        role,
        systemKey: roleData.systemKey,
      });
    }


    // ==========================================
    // ASSIGN OWNER ROLE
    // ==========================================

    const ownerRole = createdRoles.find(
      (r) => r.systemKey === 'OWNER'
    )?.role;

    if (!ownerRole) {
      throw new Error('Owner role was not created');
    }


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
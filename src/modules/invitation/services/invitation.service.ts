import { prisma } from '../../../libs/prisma';
import { otpService } from '../../../modules/auth/services/otp.service';
import { normalizePhone } from '../../../utils/phone';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

export interface CreateInvitationData {
  businessId: string;
  invitedByMemberId: string;
  phone: string;
  roles: Array<{
    roleId: string;
    scopeType: 'BUSINESS' | 'BRANCH';
    branchIds?: string[];
  }>;
}

export class InvitationService {
  async createInvitation(data: CreateInvitationData) {
    const normalizedPhone = normalizePhone(data.phone);

    return prisma.$transaction(async (tx) => {
      const business = await tx.business.findUnique({
        where: { id: data.businessId },
        select: { id: true, status: true },
      });

      if (!business || business.status !== 'ACTIVE') {
        throw new ApiError(404, 'Business not found or not active', ErrorCodes.BUSINESS_NOT_FOUND);
      }

      const roleIds = data.roles.map(r => r.roleId);
      const roles = await tx.role.findMany({
        where: {
          id: { in: roleIds },
          businessId: data.businessId,
          isActive: true,
        },
        select: { id: true },
      });

      if (roles.length !== roleIds.length) {
        throw new ApiError(400, 'One or more roles not found or not active', ErrorCodes.ROLE_NOT_FOUND);
      }

      const branchIds = data.roles
        .filter(r => r.scopeType === 'BRANCH')
        .flatMap(r => r.branchIds || []);

      if (branchIds.length > 0) {
        const branches = await tx.branch.findMany({
          where: {
            id: { in: branchIds },
            businessId: data.businessId,
            isActive: true,
          },
          select: { id: true },
        });

        if (branches.length !== branchIds.length) {
          throw new ApiError(400, 'One or more branches not found or not active', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
        }
      }

      for (const roleData of data.roles) {
        if (roleData.scopeType === 'BUSINESS' && roleData.branchIds && roleData.branchIds.length > 0) {
          throw new ApiError(400, 'BUSINESS scope cannot have branch assignments', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
        }
        if (roleData.scopeType === 'BRANCH' && (!roleData.branchIds || roleData.branchIds.length === 0)) {
          throw new ApiError(400, 'BRANCH scope requires at least one branch', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
        }
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await tx.businessInvitation.create({
        data: {
          businessId: data.businessId,
          phone: normalizedPhone,
          status: 'PENDING',
          expiresAt,
          invitedByMemberId: data.invitedByMemberId,
        },
      });

      for (const roleData of data.roles) {
        const invitationRole = await tx.invitationRole.create({
          data: {
            invitationId: invitation.id,
            roleId: roleData.roleId,
            scopeType: roleData.scopeType,
          },
        });

        if (roleData.scopeType === 'BRANCH' && roleData.branchIds) {
          await tx.invitationRoleBranch.createMany({
            data: roleData.branchIds.map(branchId => ({
              invitationRoleId: invitationRole.id,
              branchId,
            })),
          });
        }
      }

      await otpService.requestOtp(normalizedPhone, 'INVITATION_ACCEPTANCE');

      return invitation;
    });
  }

  async acceptInvitation(
    phone: string,
    verificationToken: string
  ): Promise<{ businessId: string; memberId: string }> {
    const normalizedPhone = normalizePhone(phone);

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        phone: normalizedPhone,
        purpose: 'INVITATION_ACCEPTANCE',
        status: 'VERIFIED',
      },
      orderBy: { verifiedAt: 'desc' },
    });

    if (!challenge) {
      throw new ApiError(400, 'Invalid or expired verification token', ErrorCodes.OTP_INVALID);
    }

    const invitation = await prisma.businessInvitation.findFirst({
      where: {
        phone: normalizedPhone,
        status: 'PENDING',
      },
      include: {
        roles: {
          include: {
            branches: true,
          },
        },
        business: { select: { id: true, status: true } },
      },
    });

    if (!invitation) {
      throw new ApiError(404, 'No pending invitation found', ErrorCodes.INVITATION_NOT_FOUND);
    }

    if (invitation.status !== 'PENDING') {
      throw new ApiError(400, 'Invitation is not pending', ErrorCodes.INVITATION_ALREADY_ACCEPTED);
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.businessInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new ApiError(400, 'Invitation has expired', ErrorCodes.INVITATION_EXPIRED);
    }

    if (invitation.business.status !== 'ACTIVE') {
      throw new ApiError(403, 'Business is not active', ErrorCodes.BUSINESS_SUSPENDED);
    }

    return prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { phone: normalizedPhone },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            phone: normalizedPhone,
            phoneVerifiedAt: new Date(),
            status: 'ACTIVE',
          },
        });
      } else if (user.status !== 'ACTIVE') {
        throw new ApiError(403, 'User account is suspended', ErrorCodes.USER_SUSPENDED);
      } else {
        await tx.user.update({
          where: { id: user.id },
          data: { phoneVerifiedAt: new Date() },
        });
      }

      const existingMember = await tx.businessMember.findUnique({
        where: {
          businessId_userId: {
            businessId: invitation.businessId,
            userId: user.id,
          },
        },
      });

      let member;
      if (existingMember) {
        if (existingMember.status === 'ACTIVE') {
          throw new ApiError(409, 'Already a member of this business', ErrorCodes.CONFLICT);
        }
        member = await tx.businessMember.update({
          where: { id: existingMember.id },
          data: { status: 'ACTIVE', joinedAt: new Date() },
        });
      } else {
        member = await tx.businessMember.create({
          data: {
            businessId: invitation.businessId,
            userId: user.id,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });
      }

      for (const invRole of invitation.roles) {
        const userRole = await tx.userRole.create({
          data: {
            businessMemberId: member.id,
            roleId: invRole.roleId,
            scopeType: invRole.scopeType,
          },
        });

        if (invRole.scopeType === 'BRANCH' && invRole.branches.length > 0) {
          await tx.userRoleBranch.createMany({
            data: invRole.branches.map((b: { branchId: any; }) => ({
              userRoleId: userRole.id,
              branchId: b.branchId,
            })),
          });
        }
      }

      await tx.businessInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      });

      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'CONSUMED' },
      });

      return { businessId: invitation.businessId, memberId: member.id };
    });
  }

  async getInvitations(businessId: string, status?: string) {
    const where: any = { businessId };
    if (status) where.status = status;

    return prisma.businessInvitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        roles: {
          include: {
            role: { select: { id: true, name: true, systemKey: true } },
            branches: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
        invitedByMember: {
          include: { user: { select: { id: true, phone: true } } },
        },
      },
    });
  }

  async revokeInvitation(invitationId: string, businessId: string) {
    return prisma.$transaction(async (tx) => {
      const invitation = await tx.businessInvitation.findFirst({
        where: { id: invitationId, businessId },
      });

      if (!invitation) {
        throw new ApiError(404, 'Invitation not found', ErrorCodes.INVITATION_NOT_FOUND);
      }

      if (invitation.status !== 'PENDING') {
        throw new ApiError(400, 'Can only revoke pending invitations', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
      }

      return tx.businessInvitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
    });
  }
}

export const invitationService = new InvitationService();
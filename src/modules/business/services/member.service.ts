import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

export interface MemberWithRoles {
  id: string;
  userId: string;
  status: string;
  invitedAt: Date;
  joinedAt: Date | null;
  suspendedAt: Date | null;
  removedAt: Date | null;
  user: {
    id: string;
    phone: string;
    phoneVerifiedAt: Date | null;
  };
  roles: Array<{
    id: string;
    roleId: string;
    scopeType: string;
    role: {
      id: string;
      name: string;
      systemKey: string | null;
      type: string;
    };
    branches: Array<{ branchId: string; branch: { id: string; name: string } }>;
  }>;
}

export class MemberService {
  async getMembers(businessId: string) {
    return prisma.businessMember.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, phone: true, phoneVerifiedAt: true } },
        userRoles: {
          include: {
            role: { select: { id: true, name: true, systemKey: true, type: true } },
            branches: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  async getMember(businessId: string, memberId: string) {
    const member = await prisma.businessMember.findFirst({
      where: { id: memberId, businessId },
      include: {
        user: { select: { id: true, phone: true, phoneVerifiedAt: true } },
        userRoles: {
          include: {
            role: { select: { id: true, name: true, systemKey: true, type: true } },
            branches: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!member) {
      throw new ApiError(404, 'Member not found', ErrorCodes.NOT_FOUND);
    }

    return member;
  }

  async updateMember(businessId: string, memberId: string, data: Partial<{ /* updatable fields */ }>) {
    const member = await prisma.businessMember.findFirst({
      where: { id: memberId, businessId },
    });

    if (!member) {
      throw new ApiError(404, 'Member not found', ErrorCodes.NOT_FOUND);
    }

    return prisma.businessMember.update({
      where: { id: memberId },
      data,
      include: {
        user: { select: { id: true, phone: true, phoneVerifiedAt: true } },
        userRoles: {
          include: {
            role: { select: { id: true, name: true, systemKey: true, type: true } },
            branches: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  async updateMemberStatus(
    businessId: string,
    memberId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    currentUserId: string
  ) {
    const member = await prisma.businessMember.findFirst({
      where: { id: memberId, businessId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!member) {
      throw new ApiError(404, 'Member not found', ErrorCodes.NOT_FOUND);
    }

    if (member.userId === currentUserId) {
      throw new ApiError(400, 'Cannot change your own status', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
    }

    const isOwner = member.userRoles.some((ur: { role: { systemKey: string | null; }; }) => ur.role.systemKey === 'OWNER');
    
    if (isOwner && status === 'SUSPENDED') {
      const activeOwners = await prisma.businessMember.count({
        where: {
          businessId,
          status: 'ACTIVE',
          userRoles: { some: { role: { systemKey: 'OWNER' } } },
        },
      });

      if (activeOwners <= 1) {
        throw new ApiError(403, 'Cannot suspend the last active owner', ErrorCodes.CANNOT_SUSPEND_LAST_OWNER);
      }
    }

    const updateData: any = { status };
    if (status === 'SUSPENDED') updateData.suspendedAt = new Date();
    if (status === 'ACTIVE') updateData.suspendedAt = null;

    return prisma.businessMember.update({
      where: { id: memberId },
      data: updateData,
      include: {
        user: { select: { id: true, phone: true, phoneVerifiedAt: true } },
        userRoles: {
          include: {
            role: { select: { id: true, name: true, systemKey: true, type: true } },
            branches: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  async removeMember(businessId: string, memberId: string, currentUserId: string) {
    const member = await prisma.businessMember.findFirst({
      where: { id: memberId, businessId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!member) {
      throw new ApiError(404, 'Member not found', ErrorCodes.NOT_FOUND);
    }

    if (member.userId === currentUserId) {
      throw new ApiError(400, 'Cannot remove yourself', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
    }

    const isOwner = member.userRoles.some((ur: { role: { systemKey: string | null; }; }) => ur.role.systemKey === 'OWNER');
    
    if (isOwner) {
      const activeOwners = await prisma.businessMember.count({
        where: {
          businessId,
          status: 'ACTIVE',
          userRoles: { some: { role: { systemKey: 'OWNER' } } },
        },
      });

      if (activeOwners <= 1) {
        throw new ApiError(403, 'Cannot remove the last active owner', ErrorCodes.CANNOT_REMOVE_LAST_OWNER);
      }
    }

    return prisma.businessMember.update({
      where: { id: memberId },
      data: { status: 'REMOVED', removedAt: new Date() },
      include: {
        user: { select: { id: true, phone: true, phoneVerifiedAt: true } },
        userRoles: {
          include: {
            role: { select: { id: true, name: true, systemKey: true, type: true } },
            branches: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }
}

export const memberService = new MemberService();
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

export type FeedbackPermission = 'FEEDBACK_VIEW' | 'FEEDBACK_MANAGE';

/**
 * System roles allowed to touch feedback in the MVP.
 * BRANCH_MANAGER / RECEPTIONIST / STAFF are intentionally excluded.
 */
const FEEDBACK_SYSTEM_ROLES = ['OWNER', 'ADMIN'];

/**
 * Business-scoped authorization for every admin feedback operation.
 *
 * Access is granted when the caller has an ACTIVE membership in the requested
 * business AND either:
 *   - holds the OWNER/ADMIN system role, or
 *   - holds a role that has been granted the required FEEDBACK_* permission.
 *
 * This mirrors the existing `verifyMembershipAndPermission` convention used by
 * the business-configuration module, so feedback does not depend on a fresh
 * permission seed for businesses that were created earlier.
 */
export class FeedbackAccessService {
  async assertFeedbackAccess(
    businessId: string,
    userId: string,
    requiredPermission: FeedbackPermission
  ) {
    if (!businessId) {
      throw new ApiError(400, 'Business ID is required', ErrorCodes.BAD_REQUEST);
    }

    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
        business: { select: { status: true } },
      },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    if (member.business.status !== 'ACTIVE') {
      throw new ApiError(403, 'Business is not active', ErrorCodes.BUSINESS_SUSPENDED);
    }

    const activeRoles = member.userRoles.filter((ur) => ur.role.isActive);

    const isOwnerOrAdmin = activeRoles.some(
      (ur) => ur.role.systemKey !== null && FEEDBACK_SYSTEM_ROLES.includes(ur.role.systemKey)
    );

    const permissionCodes = new Set(
      activeRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))
    );

    const hasPermission =
      requiredPermission === 'FEEDBACK_MANAGE'
        ? permissionCodes.has('FEEDBACK_MANAGE')
        : permissionCodes.has('FEEDBACK_VIEW') || permissionCodes.has('FEEDBACK_MANAGE');

    if (!isOwnerOrAdmin && !hasPermission) {
      throw new ApiError(
        403,
        `Permission '${requiredPermission}' required`,
        ErrorCodes.INSUFFICIENT_PERMISSIONS,
        { permission: requiredPermission }
      );
    }

    return member;
  }
}

export const feedbackAccessService = new FeedbackAccessService();

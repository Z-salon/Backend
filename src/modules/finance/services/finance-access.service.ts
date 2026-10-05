import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';

/**
 * Resolved financial data scope for a business member.
 *
 * Multi-branch rule: Owner/Admin (or any BUSINESS-scoped role) may see every branch.
 * Branch-scoped members are limited to the branches their roles are assigned to.
 * A requested branch is always validated against the scope — the branch id from the
 * request is never trusted on its own.
 */
export interface FinanceScope {
  memberId: string;
  isOwnerOrAdmin: boolean;
  allBranches: boolean;
  /** Branches the member may access when `allBranches` is false. */
  allowedBranchIds: string[];
}

export class FinanceAccessService {
  async resolveScope(
    businessId: string,
    userId: string,
    requestedBranchId?: string | null
  ): Promise<FinanceScope> {
    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        userRoles: {
          include: {
            role: { select: { systemKey: true } },
            branches: { select: { branchId: true } },
          },
        },
      },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw ApiError.forbidden('Not a member of this business');
    }

    const systemKeys = member.userRoles
      .map((ur) => ur.role.systemKey)
      .filter((key): key is string => Boolean(key));
    const isOwnerOrAdmin = systemKeys.some((key) => ['OWNER', 'ADMIN'].includes(key));
    const hasBusinessScope = member.userRoles.some((ur) => ur.scopeType === 'BUSINESS');
    const allBranches = isOwnerOrAdmin || hasBusinessScope;

    const allowedBranchIds = Array.from(
      new Set(
        member.userRoles
          .filter((ur) => ur.scopeType === 'BRANCH')
          .flatMap((ur) => ur.branches.map((b) => b.branchId))
      )
    );

    if (requestedBranchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: requestedBranchId, businessId },
        select: { id: true },
      });
      if (!branch) {
        throw ApiError.badRequest('Branch not found in this business');
      }
      if (!allBranches && !allowedBranchIds.includes(requestedBranchId)) {
        throw ApiError.forbidden('Cannot access financial data for this branch');
      }
    }

    return { memberId: member.id, isOwnerOrAdmin, allBranches, allowedBranchIds };
  }

  /** Prisma `where` fragment for branch scoping. Empty object = all scoped branches. */
  branchWhere(scope: FinanceScope, requestedBranchId?: string | null): { branchId?: string | { in: string[] } } {
    if (requestedBranchId) return { branchId: requestedBranchId };
    if (scope.allBranches) return {};
    return { branchId: { in: scope.allowedBranchIds } };
  }

  /**
   * Branch ids for a raw SQL `IN (...)` filter, or `null` when no branch filter is
   * needed. When a branch-scoped member has zero branches this returns `[]`, which
   * makes the query match nothing — the safe default.
   */
  sqlBranchIds(scope: FinanceScope, requestedBranchId?: string | null): string[] | null {
    if (requestedBranchId) return [requestedBranchId];
    if (scope.allBranches) return null;
    return scope.allowedBranchIds;
  }
}

export const financeAccessService = new FinanceAccessService();

import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  type: string;
  systemKey: string | null;
  isActive: boolean;
  permissions: Array<{
    permissionId: string;
    permission: {
      id: string;
      code: string;
      name: string;
      module: string;
      description: string | null;
    };
  }>;
}

export class RoleService {
  async getRoles(businessId: string): Promise<RoleWithPermissions[]> {
    return prisma.role.findMany({
      where: { businessId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async getRole(businessId: string, roleId: string): Promise<RoleWithPermissions> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, businessId },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new ApiError(404, 'Role not found', ErrorCodes.ROLE_NOT_FOUND);
    }

    return role;
  }

  async createRole(
    businessId: string,
    data: {
      name: string;
      description?: string;
      permissionCodes?: string[];
    }
  ): Promise<RoleWithPermissions> {
    const existingRole = await prisma.role.findFirst({
      where: { businessId, name: data.name },
    });

    if (existingRole) {
      throw new ApiError(409, 'Role with this name already exists', ErrorCodes.CONFLICT);
    }

    return prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          businessId,
          name: data.name,
          description: data.description,
          type: 'CUSTOM',
          systemKey: null,
          isActive: true,
        },
      });

      if (data.permissionCodes && data.permissionCodes.length > 0) {
        const permissions = await tx.permission.findMany({
          where: { code: { in: data.permissionCodes } },
          select: { id: true, code: true },
        });

        const permissionMap = new Map(permissions.map((p: { code: any; id: any; }) => [p.code, p.id]));
        const validPermissionIds = data.permissionCodes
          .map(code => permissionMap.get(code))
          .filter((id): id is string => id !== undefined);

        if (validPermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: validPermissionIds.map(permissionId => ({
              roleId: role.id,
              permissionId,
            })),
          });
        }
      }

      return this.getRole(businessId, role.id);
    });
  }

  async updateRole(
    businessId: string,
    roleId: string,
    data: { name?: string; description?: string; isActive?: boolean }
  ): Promise<RoleWithPermissions> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, businessId },
    });

    if (!role) {
      throw new ApiError(404, 'Role not found', ErrorCodes.ROLE_NOT_FOUND);
    }

    if (role.type === 'SYSTEM') {
      throw new ApiError(403, 'Cannot modify system roles', ErrorCodes.ROLE_SYSTEM_PROTECTED);
    }

    if (data.name) {
      const existing = await prisma.role.findFirst({
        where: { businessId, name: data.name, id: { not: roleId } },
      });
      if (existing) {
        throw new ApiError(409, 'Role with this name already exists', ErrorCodes.CONFLICT);
      }
    }

    await prisma.role.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
      },
    });

    return this.getRole(businessId, roleId);
  }

  async updateRolePermissions(
    businessId: string,
    roleId: string,
    permissionCodes: string[]
  ): Promise<RoleWithPermissions> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, businessId },
    });

    if (!role) {
      throw new ApiError(404, 'Role not found', ErrorCodes.ROLE_NOT_FOUND);
    }

    if (role.systemKey === 'OWNER') {
      throw new ApiError(403, 'Cannot modify Owner role permissions', ErrorCodes.OWNER_PERMISSIONS_PROTECTED);
    }

    return prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });

      if (permissionCodes.length > 0) {
        const permissions = await tx.permission.findMany({
          where: { code: { in: permissionCodes } },
          select: { id: true, code: true },
        });

        const permissionMap = new Map(permissions.map((p: { code: any; id: any; }) => [p.code, p.id]));
        const validPermissionIds = permissionCodes
          .map(code => permissionMap.get(code))
          .filter((id): id is string => id !== undefined);

        if (validPermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: validPermissionIds.map(permissionId => ({
              roleId,
              permissionId,
            })),
          });
        }
      }

      return this.getRole(businessId, roleId);
    });
  }

  async deleteRole(businessId: string, roleId: string): Promise<void> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, businessId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!role) {
      throw new ApiError(404, 'Role not found', ErrorCodes.ROLE_NOT_FOUND);
    }

    if (role.type === 'SYSTEM') {
      throw new ApiError(403, 'Cannot delete system roles', ErrorCodes.ROLE_SYSTEM_PROTECTED);
    }

    const activeAssignments = role.userRoles.filter((ur: { role: { isActive: any; }; }) => ur.role.isActive);
    if (activeAssignments.length > 0) {
      throw new ApiError(409, 'Cannot delete role assigned to active members', ErrorCodes.ROLE_HAS_MEMBERS);
    }

    await prisma.role.delete({ where: { id: roleId } });
  }

  async assignRole(
    businessId: string,
    memberId: string,
    data: {
      roleId: string;
      scopeType: 'BUSINESS' | 'BRANCH';
      branchIds?: string[];
    }
  ) {
    const member = await prisma.businessMember.findFirst({
      where: { id: memberId, businessId, status: 'ACTIVE' },
    });

    if (!member) {
      throw new ApiError(404, 'Member not found', ErrorCodes.NOT_FOUND);
    }

    const role = await prisma.role.findFirst({
      where: { id: data.roleId, businessId, isActive: true },
    });

    if (!role) {
      throw new ApiError(404, 'Role not found or not active', ErrorCodes.ROLE_NOT_FOUND);
    }

    if (data.scopeType === 'BUSINESS' && data.branchIds && data.branchIds.length > 0) {
      throw new ApiError(400, 'BUSINESS scope cannot have branch assignments', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
    }

    if (data.scopeType === 'BRANCH' && (!data.branchIds || data.branchIds.length === 0)) {
      throw new ApiError(400, 'BRANCH scope requires at least one branch', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
    }

    if (data.branchIds && data.branchIds.length > 0) {
      const branches = await prisma.branch.findMany({
        where: { id: { in: data.branchIds }, businessId, isActive: true },
        select: { id: true },
      });
      if (branches.length !== data.branchIds.length) {
        throw new ApiError(400, 'One or more branches not found', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
      }
    }

    return prisma.$transaction(async (tx: { userRole: { create: (arg0: { data: { businessMemberId: string; roleId: string; scopeType: "BUSINESS" | "BRANCH"; }; }) => any; }; userRoleBranch: { createMany: (arg0: { data: { userRoleId: any; branchId: string; }[]; }) => any; }; }) => {
      const userRole = await tx.userRole.create({
        data: {
          businessMemberId: memberId,
          roleId: data.roleId,
          scopeType: data.scopeType,
        },
      });

      if (data.scopeType === 'BRANCH' && data.branchIds) {
        await tx.userRoleBranch.createMany({
          data: data.branchIds.map(branchId => ({
            userRoleId: userRole.id,
            branchId,
          })),
        });
      }

      return userRole;
    });
  }

  async removeRoleAssignment(businessId: string, memberId: string, userRoleId: string, currentUserId: string) {
    const userRole = await prisma.userRole.findFirst({
      where: {
        id: userRoleId,
        businessMemberId: memberId,
        businessMember: { businessId },
      },
      include: { role: true, businessMember: true },
    });

    if (!userRole) {
      throw new ApiError(404, 'Role assignment not found', ErrorCodes.NOT_FOUND);
    }

    if (userRole.businessMember.userId === currentUserId) {
      throw new ApiError(400, 'Cannot remove your own role', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
    }

    if (userRole.role.systemKey === 'OWNER') {
      const activeOwners = await prisma.businessMember.count({
        where: {
          businessId,
          status: 'ACTIVE',
          userRoles: { some: { role: { systemKey: 'OWNER' } } },
        },
      });

      if (activeOwners <= 1) {
        throw new ApiError(403, 'Cannot remove the last Owner role assignment', ErrorCodes.CANNOT_REMOVE_OWNER_ROLE);
      }
    }

    await prisma.userRole.delete({ where: { id: userRoleId } });
  }
}

export const roleService = new RoleService();
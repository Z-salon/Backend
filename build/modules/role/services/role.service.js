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
exports.roleService = exports.RoleService = void 0;
const prisma_1 = require("../../../libs/prisma");
const api_error_1 = require("../../../utils/api-error");
class RoleService {
    getRoles(businessId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.role.findMany({
                where: { businessId, isActive: true },
                orderBy: { createdAt: 'asc' },
                include: {
                    permissions: {
                        include: { permission: true },
                    },
                },
            });
        });
    }
    getRole(businessId, roleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const role = yield prisma_1.prisma.role.findFirst({
                where: { id: roleId, businessId },
                include: {
                    permissions: {
                        include: { permission: true },
                    },
                },
            });
            if (!role) {
                throw new api_error_1.ApiError(404, 'Role not found', api_error_1.ErrorCodes.ROLE_NOT_FOUND);
            }
            return role;
        });
    }
    createRole(businessId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingRole = yield prisma_1.prisma.role.findFirst({
                where: { businessId, name: data.name },
            });
            if (existingRole) {
                throw new api_error_1.ApiError(409, 'Role with this name already exists', api_error_1.ErrorCodes.CONFLICT);
            }
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const role = yield tx.role.create({
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
                    const permissions = yield tx.permission.findMany({
                        where: { code: { in: data.permissionCodes } },
                        select: { id: true, code: true },
                    });
                    const permissionMap = new Map(permissions.map((p) => [p.code, p.id]));
                    const validPermissionIds = data.permissionCodes
                        .map(code => permissionMap.get(code))
                        .filter((id) => id !== undefined);
                    if (validPermissionIds.length > 0) {
                        yield tx.rolePermission.createMany({
                            data: validPermissionIds.map(permissionId => ({
                                roleId: role.id,
                                permissionId,
                            })),
                        });
                    }
                }
                return this.getRole(businessId, role.id);
            }));
        });
    }
    updateRole(businessId, roleId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const role = yield prisma_1.prisma.role.findFirst({
                where: { id: roleId, businessId },
            });
            if (!role) {
                throw new api_error_1.ApiError(404, 'Role not found', api_error_1.ErrorCodes.ROLE_NOT_FOUND);
            }
            if (role.type === 'SYSTEM') {
                throw new api_error_1.ApiError(403, 'Cannot modify system roles', api_error_1.ErrorCodes.ROLE_SYSTEM_PROTECTED);
            }
            if (data.name) {
                const existing = yield prisma_1.prisma.role.findFirst({
                    where: { businessId, name: data.name, id: { not: roleId } },
                });
                if (existing) {
                    throw new api_error_1.ApiError(409, 'Role with this name already exists', api_error_1.ErrorCodes.CONFLICT);
                }
            }
            yield prisma_1.prisma.role.update({
                where: { id: roleId },
                data: {
                    name: data.name,
                    description: data.description,
                    isActive: data.isActive,
                },
            });
            return this.getRole(businessId, roleId);
        });
    }
    updateRolePermissions(businessId, roleId, permissionCodes) {
        return __awaiter(this, void 0, void 0, function* () {
            const role = yield prisma_1.prisma.role.findFirst({
                where: { id: roleId, businessId },
            });
            if (!role) {
                throw new api_error_1.ApiError(404, 'Role not found', api_error_1.ErrorCodes.ROLE_NOT_FOUND);
            }
            if (role.systemKey === 'OWNER') {
                throw new api_error_1.ApiError(403, 'Cannot modify Owner role permissions', api_error_1.ErrorCodes.OWNER_PERMISSIONS_PROTECTED);
            }
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.rolePermission.deleteMany({ where: { roleId } });
                if (permissionCodes.length > 0) {
                    const permissions = yield tx.permission.findMany({
                        where: { code: { in: permissionCodes } },
                        select: { id: true, code: true },
                    });
                    const permissionMap = new Map(permissions.map((p) => [p.code, p.id]));
                    const validPermissionIds = permissionCodes
                        .map(code => permissionMap.get(code))
                        .filter((id) => id !== undefined);
                    if (validPermissionIds.length > 0) {
                        yield tx.rolePermission.createMany({
                            data: validPermissionIds.map(permissionId => ({
                                roleId,
                                permissionId,
                            })),
                        });
                    }
                }
                return this.getRole(businessId, roleId);
            }));
        });
    }
    deleteRole(businessId, roleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const role = yield prisma_1.prisma.role.findFirst({
                where: { id: roleId, businessId },
                include: { userRoles: { include: { role: true } } },
            });
            if (!role) {
                throw new api_error_1.ApiError(404, 'Role not found', api_error_1.ErrorCodes.ROLE_NOT_FOUND);
            }
            if (role.type === 'SYSTEM') {
                throw new api_error_1.ApiError(403, 'Cannot delete system roles', api_error_1.ErrorCodes.ROLE_SYSTEM_PROTECTED);
            }
            const activeAssignments = role.userRoles.filter((ur) => ur.role.isActive);
            if (activeAssignments.length > 0) {
                throw new api_error_1.ApiError(409, 'Cannot delete role assigned to active members', api_error_1.ErrorCodes.ROLE_HAS_MEMBERS);
            }
            yield prisma_1.prisma.role.delete({ where: { id: roleId } });
        });
    }
    assignRole(businessId, memberId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const member = yield prisma_1.prisma.businessMember.findFirst({
                where: { id: memberId, businessId, status: 'ACTIVE' },
            });
            if (!member) {
                throw new api_error_1.ApiError(404, 'Member not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            const role = yield prisma_1.prisma.role.findFirst({
                where: { id: data.roleId, businessId, isActive: true },
            });
            if (!role) {
                throw new api_error_1.ApiError(404, 'Role not found or not active', api_error_1.ErrorCodes.ROLE_NOT_FOUND);
            }
            if (data.scopeType === 'BUSINESS' && data.branchIds && data.branchIds.length > 0) {
                throw new api_error_1.ApiError(400, 'BUSINESS scope cannot have branch assignments', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
            }
            if (data.scopeType === 'BRANCH' && (!data.branchIds || data.branchIds.length === 0)) {
                throw new api_error_1.ApiError(400, 'BRANCH scope requires at least one branch', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
            }
            if (data.branchIds && data.branchIds.length > 0) {
                const branches = yield prisma_1.prisma.branch.findMany({
                    where: { id: { in: data.branchIds }, businessId, isActive: true },
                    select: { id: true },
                });
                if (branches.length !== data.branchIds.length) {
                    throw new api_error_1.ApiError(400, 'One or more branches not found', api_error_1.ErrorCodes.BRANCH_NOT_IN_BUSINESS);
                }
            }
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const userRole = yield tx.userRole.create({
                    data: {
                        businessMemberId: memberId,
                        roleId: data.roleId,
                        scopeType: data.scopeType,
                    },
                });
                if (data.scopeType === 'BRANCH' && data.branchIds) {
                    yield tx.userRoleBranch.createMany({
                        data: data.branchIds.map(branchId => ({
                            userRoleId: userRole.id,
                            branchId,
                        })),
                    });
                }
                return userRole;
            }));
        });
    }
    removeRoleAssignment(businessId, memberId, userRoleId, currentUserId) {
        return __awaiter(this, void 0, void 0, function* () {
            const userRole = yield prisma_1.prisma.userRole.findFirst({
                where: {
                    id: userRoleId,
                    businessMemberId: memberId,
                    businessMember: { businessId },
                },
                include: { role: true, businessMember: true },
            });
            if (!userRole) {
                throw new api_error_1.ApiError(404, 'Role assignment not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            if (userRole.businessMember.userId === currentUserId) {
                throw new api_error_1.ApiError(400, 'Cannot remove your own role', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
            }
            if (userRole.role.systemKey === 'OWNER') {
                const activeOwners = yield prisma_1.prisma.businessMember.count({
                    where: {
                        businessId,
                        status: 'ACTIVE',
                        userRoles: { some: { role: { systemKey: 'OWNER' } } },
                    },
                });
                if (activeOwners <= 1) {
                    throw new api_error_1.ApiError(403, 'Cannot remove the last Owner role assignment', api_error_1.ErrorCodes.CANNOT_REMOVE_OWNER_ROLE);
                }
            }
            yield prisma_1.prisma.userRole.delete({ where: { id: userRoleId } });
        });
    }
}
exports.RoleService = RoleService;
exports.roleService = new RoleService();

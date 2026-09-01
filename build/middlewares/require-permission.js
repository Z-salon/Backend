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
exports.requirePermission = requirePermission;
exports.requireAnyPermission = requireAnyPermission;
exports.requireAllPermissions = requireAllPermissions;
const prisma_1 = require("../libs/prisma");
const api_error_1 = require("../utils/api-error");
function requirePermission(permissionCode) {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!req.auth || !req.businessMember) {
                throw new api_error_1.ApiError(401, 'Authentication and business membership required', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            const { businessId, roleIds } = req.businessMember;
            const rolesWithPermissions = yield prisma_1.prisma.role.findMany({
                where: {
                    id: { in: roleIds },
                    businessId,
                    isActive: true,
                },
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            });
            const hasPermission = rolesWithPermissions.some((role) => role.permissions.some((rp) => rp.permission.code === permissionCode));
            if (!hasPermission) {
                throw new api_error_1.ApiError(403, `Permission '${permissionCode}' required`, api_error_1.ErrorCodes.INSUFFICIENT_PERMISSIONS, { permission: permissionCode });
            }
            next();
        }
        catch (error) {
            next(error);
        }
    });
}
function requireAnyPermission(permissionCodes) {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!req.auth || !req.businessMember) {
                throw new api_error_1.ApiError(401, 'Authentication and business membership required', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            const { businessId, roleIds } = req.businessMember;
            const rolesWithPermissions = yield prisma_1.prisma.role.findMany({
                where: {
                    id: { in: roleIds },
                    businessId,
                    isActive: true,
                },
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            });
            const hasPermission = rolesWithPermissions.some((role) => role.permissions.some((rp) => permissionCodes.includes(rp.permission.code)));
            if (!hasPermission) {
                throw new api_error_1.ApiError(403, `One of permissions [${permissionCodes.join(', ')}] required`, api_error_1.ErrorCodes.INSUFFICIENT_PERMISSIONS, { permissions: permissionCodes });
            }
            next();
        }
        catch (error) {
            next(error);
        }
    });
}
function requireAllPermissions(permissionCodes) {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!req.auth || !req.businessMember) {
                throw new api_error_1.ApiError(401, 'Authentication and business membership required', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            const { businessId, roleIds } = req.businessMember;
            const rolesWithPermissions = yield prisma_1.prisma.role.findMany({
                where: {
                    id: { in: roleIds },
                    businessId,
                    isActive: true,
                },
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            });
            const allPermissionCodes = new Set(rolesWithPermissions.flatMap((role) => role.permissions.map((rp) => rp.permission.code)));
            const missingPermissions = permissionCodes.filter(code => !allPermissionCodes.has(code));
            if (missingPermissions.length > 0) {
                throw new api_error_1.ApiError(403, `Missing permissions: ${missingPermissions.join(', ')}`, api_error_1.ErrorCodes.INSUFFICIENT_PERMISSIONS, { missingPermissions });
            }
            next();
        }
        catch (error) {
            next(error);
        }
    });
}

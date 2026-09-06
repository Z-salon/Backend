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
exports.requireBranchAccess = requireBranchAccess;
const prisma_1 = require("../libs/prisma");
const api_error_1 = require("../utils/api-error");
function requireBranchAccess(branchIdParam = 'branchId') {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!req.auth) {
                throw new api_error_1.ApiError(401, 'Authentication required', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            if (!req.businessMember) {
                throw new api_error_1.ApiError(401, 'business membership required', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            const branchId = req.params[branchIdParam];
            if (!branchId) {
                throw new api_error_1.ApiError(400, 'Branch ID is required', api_error_1.ErrorCodes.BAD_REQUEST);
            }
            const { businessId, roleIds } = req.businessMember;
            const branch = yield prisma_1.prisma.branch.findFirst({
                where: {
                    id: branchId,
                    businessId,
                    isActive: true,
                },
                select: { id: true },
            });
            if (!branch) {
                throw new api_error_1.ApiError(404, 'Branch not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            const userRoles = yield prisma_1.prisma.userRole.findMany({
                where: {
                    businessMemberId: req.businessMember.id,
                    role: {
                        businessId,
                        isActive: true,
                    },
                },
                include: {
                    branches: {
                        select: { branchId: true },
                    },
                    role: {
                        select: { id: true },
                    },
                },
            });
            const hasBusinessScope = userRoles.some((ur) => ur.scopeType === 'BUSINESS');
            if (hasBusinessScope) {
                next();
                return;
            }
            const allowedBranchIds = new Set(userRoles
                .filter((ur) => ur.scopeType === 'BRANCH')
                .flatMap((ur) => ur.branches.map((b) => b.branchId)));
            if (!allowedBranchIds.has(branchId)) {
                throw new api_error_1.ApiError(403, 'Access denied to this branch', api_error_1.ErrorCodes.FORBIDDEN, { branchId });
            }
            next();
        }
        catch (error) {
            next(error);
        }
    });
}

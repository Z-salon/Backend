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
exports.requireBusinessMembership = requireBusinessMembership;
const prisma_1 = require("../libs/prisma");
const api_error_1 = require("../utils/api-error");
function requireBusinessMembership(req, res, next) {
    (() => __awaiter(this, void 0, void 0, function* () {
        try {
            const businessId = req.params.businessId;
            if (!businessId) {
                throw new api_error_1.ApiError(400, 'Business ID is required', api_error_1.ErrorCodes.BAD_REQUEST);
            }
            if (!req.auth) {
                throw new api_error_1.ApiError(401, 'Authentication required', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            const membership = yield prisma_1.prisma.businessMember.findUnique({
                where: {
                    businessId_userId: {
                        businessId,
                        userId: req.auth.userId,
                    },
                },
                select: {
                    id: true,
                    businessId: true,
                    userId: true,
                    status: true,
                    userRoles: {
                        select: { roleId: true },
                    },
                },
            });
            if (!membership) {
                throw new api_error_1.ApiError(403, 'Not a member of this business', api_error_1.ErrorCodes.NOT_BUSINESS_MEMBER);
            }
            if (membership.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'Membership is not active', api_error_1.ErrorCodes.MEMBER_STATUS_INVALID);
            }
            const business = yield prisma_1.prisma.business.findUnique({
                where: { id: businessId },
                select: { status: true },
            });
            if (!business || business.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'Business is not active', api_error_1.ErrorCodes.BUSINESS_SUSPENDED);
            }
            req.businessMember = {
                id: membership.id,
                businessId: membership.businessId,
                userId: membership.userId,
                status: membership.status,
                roleIds: membership.userRoles.map((ur) => ur.roleId),
            };
            next();
        }
        catch (error) {
            next(error);
        }
    }))();
}

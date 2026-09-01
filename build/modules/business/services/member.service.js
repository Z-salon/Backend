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
exports.memberService = exports.MemberService = void 0;
const prisma_1 = require("../../../libs/prisma");
const api_error_1 = require("../../../utils/api-error");
class MemberService {
    getMembers(businessId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.businessMember.findMany({
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
        });
    }
    getMember(businessId, memberId) {
        return __awaiter(this, void 0, void 0, function* () {
            const member = yield prisma_1.prisma.businessMember.findFirst({
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
                throw new api_error_1.ApiError(404, 'Member not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            return member;
        });
    }
    updateMember(businessId, memberId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const member = yield prisma_1.prisma.businessMember.findFirst({
                where: { id: memberId, businessId },
            });
            if (!member) {
                throw new api_error_1.ApiError(404, 'Member not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            return prisma_1.prisma.businessMember.update({
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
        });
    }
    updateMemberStatus(businessId, memberId, status, currentUserId) {
        return __awaiter(this, void 0, void 0, function* () {
            const member = yield prisma_1.prisma.businessMember.findFirst({
                where: { id: memberId, businessId },
                include: { userRoles: { include: { role: true } } },
            });
            if (!member) {
                throw new api_error_1.ApiError(404, 'Member not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            if (member.userId === currentUserId) {
                throw new api_error_1.ApiError(400, 'Cannot change your own status', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
            }
            const isOwner = member.userRoles.some((ur) => ur.role.systemKey === 'OWNER');
            if (isOwner && status === 'SUSPENDED') {
                const activeOwners = yield prisma_1.prisma.businessMember.count({
                    where: {
                        businessId,
                        status: 'ACTIVE',
                        userRoles: { some: { role: { systemKey: 'OWNER' } } },
                    },
                });
                if (activeOwners <= 1) {
                    throw new api_error_1.ApiError(403, 'Cannot suspend the last active owner', api_error_1.ErrorCodes.CANNOT_SUSPEND_LAST_OWNER);
                }
            }
            const updateData = { status };
            if (status === 'SUSPENDED')
                updateData.suspendedAt = new Date();
            if (status === 'ACTIVE')
                updateData.suspendedAt = null;
            return prisma_1.prisma.businessMember.update({
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
        });
    }
    removeMember(businessId, memberId, currentUserId) {
        return __awaiter(this, void 0, void 0, function* () {
            const member = yield prisma_1.prisma.businessMember.findFirst({
                where: { id: memberId, businessId },
                include: { userRoles: { include: { role: true } } },
            });
            if (!member) {
                throw new api_error_1.ApiError(404, 'Member not found', api_error_1.ErrorCodes.NOT_FOUND);
            }
            if (member.userId === currentUserId) {
                throw new api_error_1.ApiError(400, 'Cannot remove yourself', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
            }
            const isOwner = member.userRoles.some((ur) => ur.role.systemKey === 'OWNER');
            if (isOwner) {
                const activeOwners = yield prisma_1.prisma.businessMember.count({
                    where: {
                        businessId,
                        status: 'ACTIVE',
                        userRoles: { some: { role: { systemKey: 'OWNER' } } },
                    },
                });
                if (activeOwners <= 1) {
                    throw new api_error_1.ApiError(403, 'Cannot remove the last active owner', api_error_1.ErrorCodes.CANNOT_REMOVE_LAST_OWNER);
                }
            }
            return prisma_1.prisma.businessMember.update({
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
        });
    }
}
exports.MemberService = MemberService;
exports.memberService = new MemberService();

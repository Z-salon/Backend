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
exports.invitationService = exports.InvitationService = void 0;
const prisma_1 = require("../../../libs/prisma");
const otp_service_1 = require("../../../modules/auth/services/otp.service");
const phone_1 = require("../../../utils/phone");
const api_error_1 = require("../../../utils/api-error");
class InvitationService {
    createInvitation(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(data.phone);
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const business = yield tx.business.findUnique({
                    where: { id: data.businessId },
                    select: { id: true, status: true },
                });
                if (!business || business.status !== 'ACTIVE') {
                    throw new api_error_1.ApiError(404, 'Business not found or not active', api_error_1.ErrorCodes.BUSINESS_NOT_FOUND);
                }
                const roleIds = data.roles.map(r => r.roleId);
                const roles = yield tx.role.findMany({
                    where: {
                        id: { in: roleIds },
                        businessId: data.businessId,
                        isActive: true,
                    },
                    select: { id: true },
                });
                if (roles.length !== roleIds.length) {
                    throw new api_error_1.ApiError(400, 'One or more roles not found or not active', api_error_1.ErrorCodes.ROLE_NOT_FOUND);
                }
                const branchIds = data.roles
                    .filter(r => r.scopeType === 'BRANCH')
                    .flatMap(r => r.branchIds || []);
                if (branchIds.length > 0) {
                    const branches = yield tx.branch.findMany({
                        where: {
                            id: { in: branchIds },
                            businessId: data.businessId,
                            isActive: true,
                        },
                        select: { id: true },
                    });
                    if (branches.length !== branchIds.length) {
                        throw new api_error_1.ApiError(400, 'One or more branches not found or not active', api_error_1.ErrorCodes.BRANCH_NOT_IN_BUSINESS);
                    }
                }
                for (const roleData of data.roles) {
                    if (roleData.scopeType === 'BUSINESS' && roleData.branchIds && roleData.branchIds.length > 0) {
                        throw new api_error_1.ApiError(400, 'BUSINESS scope cannot have branch assignments', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
                    }
                    if (roleData.scopeType === 'BRANCH' && (!roleData.branchIds || roleData.branchIds.length === 0)) {
                        throw new api_error_1.ApiError(400, 'BRANCH scope requires at least one branch', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
                    }
                }
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);
                const invitation = yield tx.businessInvitation.create({
                    data: {
                        businessId: data.businessId,
                        phone: normalizedPhone,
                        status: 'PENDING',
                        expiresAt,
                        invitedByMemberId: data.invitedByMemberId,
                    },
                });
                for (const roleData of data.roles) {
                    const invitationRole = yield tx.invitationRole.create({
                        data: {
                            invitationId: invitation.id,
                            roleId: roleData.roleId,
                            scopeType: roleData.scopeType,
                        },
                    });
                    if (roleData.scopeType === 'BRANCH' && roleData.branchIds) {
                        yield tx.invitationRoleBranch.createMany({
                            data: roleData.branchIds.map(branchId => ({
                                invitationRoleId: invitationRole.id,
                                branchId,
                            })),
                        });
                    }
                }
                yield otp_service_1.otpService.requestOtp(normalizedPhone, 'INVITATION_ACCEPTANCE');
                return invitation;
            }));
        });
    }
    acceptInvitation(phone, verificationToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(phone);
            const challenge = yield prisma_1.prisma.otpChallenge.findFirst({
                where: {
                    phone: normalizedPhone,
                    purpose: 'INVITATION_ACCEPTANCE',
                    status: 'VERIFIED',
                },
                orderBy: { verifiedAt: 'desc' },
            });
            if (!challenge) {
                throw new api_error_1.ApiError(400, 'Invalid or expired verification token', api_error_1.ErrorCodes.OTP_INVALID);
            }
            const invitation = yield prisma_1.prisma.businessInvitation.findFirst({
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
                throw new api_error_1.ApiError(404, 'No pending invitation found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
            }
            if (invitation.status !== 'PENDING') {
                throw new api_error_1.ApiError(400, 'Invitation is not pending', api_error_1.ErrorCodes.INVITATION_ALREADY_ACCEPTED);
            }
            if (invitation.expiresAt < new Date()) {
                yield prisma_1.prisma.businessInvitation.update({
                    where: { id: invitation.id },
                    data: { status: 'EXPIRED' },
                });
                throw new api_error_1.ApiError(400, 'Invitation has expired', api_error_1.ErrorCodes.INVITATION_EXPIRED);
            }
            if (invitation.business.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'Business is not active', api_error_1.ErrorCodes.BUSINESS_SUSPENDED);
            }
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                let user = yield tx.user.findUnique({
                    where: { phone: normalizedPhone },
                });
                if (!user) {
                    user = yield tx.user.create({
                        data: {
                            phone: normalizedPhone,
                            phoneVerifiedAt: new Date(),
                            status: 'ACTIVE',
                        },
                    });
                }
                else if (user.status !== 'ACTIVE') {
                    throw new api_error_1.ApiError(403, 'User account is suspended', api_error_1.ErrorCodes.USER_SUSPENDED);
                }
                else {
                    yield tx.user.update({
                        where: { id: user.id },
                        data: { phoneVerifiedAt: new Date() },
                    });
                }
                const existingMember = yield tx.businessMember.findUnique({
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
                        throw new api_error_1.ApiError(409, 'Already a member of this business', api_error_1.ErrorCodes.CONFLICT);
                    }
                    member = yield tx.businessMember.update({
                        where: { id: existingMember.id },
                        data: { status: 'ACTIVE', joinedAt: new Date() },
                    });
                }
                else {
                    member = yield tx.businessMember.create({
                        data: {
                            businessId: invitation.businessId,
                            userId: user.id,
                            status: 'ACTIVE',
                            joinedAt: new Date(),
                        },
                    });
                }
                for (const invRole of invitation.roles) {
                    const userRole = yield tx.userRole.create({
                        data: {
                            businessMemberId: member.id,
                            roleId: invRole.roleId,
                            scopeType: invRole.scopeType,
                        },
                    });
                    if (invRole.scopeType === 'BRANCH' && invRole.branches.length > 0) {
                        yield tx.userRoleBranch.createMany({
                            data: invRole.branches.map((b) => ({
                                userRoleId: userRole.id,
                                branchId: b.branchId,
                            })),
                        });
                    }
                }
                yield tx.businessInvitation.update({
                    where: { id: invitation.id },
                    data: {
                        status: 'ACCEPTED',
                        acceptedAt: new Date(),
                        acceptedByUserId: user.id,
                    },
                });
                yield tx.otpChallenge.update({
                    where: { id: challenge.id },
                    data: { status: 'CONSUMED' },
                });
                return { businessId: invitation.businessId, memberId: member.id };
            }));
        });
    }
    getInvitations(businessId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            const where = { businessId };
            if (status)
                where.status = status;
            return prisma_1.prisma.businessInvitation.findMany({
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
        });
    }
    revokeInvitation(invitationId, businessId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const invitation = yield tx.businessInvitation.findFirst({
                    where: { id: invitationId, businessId },
                });
                if (!invitation) {
                    throw new api_error_1.ApiError(404, 'Invitation not found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
                }
                if (invitation.status !== 'PENDING') {
                    throw new api_error_1.ApiError(400, 'Can only revoke pending invitations', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
                }
                return tx.businessInvitation.update({
                    where: { id: invitationId },
                    data: { status: 'REVOKED', revokedAt: new Date() },
                });
            }));
        });
    }
}
exports.InvitationService = InvitationService;
exports.invitationService = new InvitationService();

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
exports.invitationController = exports.InvitationController = void 0;
const invitation_service_1 = require("../services/invitation.service");
const api_response_1 = require("../../../utils/api-response");
class InvitationController {
    createInvitation(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone, roles } = req.body;
                const businessId = req.params.businessId;
                const invitedByMemberId = req.businessMember.id;
                const invitation = yield invitation_service_1.invitationService.createInvitation({
                    businessId,
                    invitedByMemberId,
                    phone,
                    roles,
                });
                res.status(201).json((0, api_response_1.successResponse)('Invitation sent successfully', invitation));
            }
            catch (error) {
                next(error);
            }
        });
    }
    getInvitationDetails(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { invitationToken } = req.params;
                const invitationDetails = yield invitation_service_1.invitationService.getInvitationDetails(invitationToken);
                res.json((0, api_response_1.successResponse)('Invitation details retrieved', invitationDetails));
            }
            catch (error) {
                next(error);
            }
        });
    }
    acceptInvitation(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { verificationToken } = req.body;
                const authUserId = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.userId;
                const invitationToken = req.params.invitationToken;
                const result = yield invitation_service_1.invitationService.acceptInvitation(invitationToken, authUserId, verificationToken);
                res.json((0, api_response_1.successResponse)('Invitation accepted successfully', result));
            }
            catch (error) {
                next(error);
            }
        });
    }
    getInvitations(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const businessId = req.params.businessId;
                const { status } = req.query;
                const invitations = yield invitation_service_1.invitationService.getInvitations(businessId, status);
                res.json((0, api_response_1.successResponse)('Invitations retrieved', invitations));
            }
            catch (error) {
                next(error);
            }
        });
    }
    revokeInvitation(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, invitationId } = req.params;
                yield invitation_service_1.invitationService.revokeInvitation(invitationId, businessId);
                res.json((0, api_response_1.successResponse)('Invitation revoked'));
            }
            catch (error) {
                next(error);
            }
        });
    }
}
exports.InvitationController = InvitationController;
exports.invitationController = new InvitationController();

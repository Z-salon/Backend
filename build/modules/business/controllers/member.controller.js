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
exports.memberController = exports.MemberController = void 0;
const member_service_1 = require("../services/member.service");
const api_response_1 = require("../../../utils/api-response");
class MemberController {
    getMembers(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const businessId = req.params.businessId;
                const members = yield member_service_1.memberService.getMembers(businessId);
                res.json((0, api_response_1.successResponse)('Members retrieved', members));
            }
            catch (error) {
                next(error);
            }
        });
    }
    getMember(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, memberId } = req.params;
                const member = yield member_service_1.memberService.getMember(businessId, memberId);
                res.json((0, api_response_1.successResponse)('Member retrieved', member));
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateMember(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, memberId } = req.params;
                const member = yield member_service_1.memberService.updateMember(businessId, memberId, req.body);
                res.json((0, api_response_1.successResponse)('Member updated', member));
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateMemberStatus(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, memberId } = req.params;
                const { status } = req.body;
                const currentUserId = req.auth.userId;
                const member = yield member_service_1.memberService.updateMemberStatus(businessId, memberId, status, currentUserId);
                res.json((0, api_response_1.successResponse)('Member status updated', member));
            }
            catch (error) {
                next(error);
            }
        });
    }
    removeMember(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, memberId } = req.params;
                const currentUserId = req.auth.userId;
                const member = yield member_service_1.memberService.removeMember(businessId, memberId, currentUserId);
                res.json((0, api_response_1.successResponse)('Member removed', member));
            }
            catch (error) {
                next(error);
            }
        });
    }
}
exports.MemberController = MemberController;
exports.memberController = new MemberController();

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
exports.authenticate = authenticate;
exports.optionalAuth = optionalAuth;
const jwt_1 = require("../libs/jwt");
const prisma_1 = require("../libs/prisma");
const api_error_1 = require("../utils/api-error");
function authenticate(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                throw new api_error_1.ApiError(401, 'Authorization header missing', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            const token = authHeader.substring(7);
            const payload = (0, jwt_1.verifyAccessToken)(token);
            const session = yield prisma_1.prisma.session.findUnique({
                where: { id: payload.sessionId },
                select: { id: true, userId: true, status: true, expiresAt: true },
            });
            if (!session) {
                throw new api_error_1.ApiError(401, 'Session not found', api_error_1.ErrorCodes.SESSION_REVOKED);
            }
            if (session.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(401, 'Session has been revoked', api_error_1.ErrorCodes.SESSION_REVOKED);
            }
            if (session.expiresAt < new Date()) {
                throw new api_error_1.ApiError(401, 'Session has expired', api_error_1.ErrorCodes.SESSION_EXPIRED);
            }
            const user = yield prisma_1.prisma.user.findUnique({
                where: { id: session.userId },
                select: { id: true, status: true },
            });
            if (!user) {
                throw new api_error_1.ApiError(401, 'User not found', api_error_1.ErrorCodes.USER_NOT_FOUND);
            }
            if (user.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'User account is suspended', api_error_1.ErrorCodes.USER_SUSPENDED);
            }
            req.auth = {
                userId: user.id,
                sessionId: session.id,
            };
            next();
        }
        catch (error) {
            next(error);
        }
    });
}
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
    }
    authenticate(req, res, next);
}

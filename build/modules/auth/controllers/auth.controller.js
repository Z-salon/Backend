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
exports.authController = exports.AuthController = void 0;
const otp_service_1 = require("../services/otp.service");
const auth_service_1 = require("../services/auth.service");
const session_service_1 = require("../services/session.service");
const api_response_1 = require("../../../utils/api-response");
class AuthController {
    requestOtp(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone, purpose } = req.body;
                const ip = req.ip || req.socket.remoteAddress;
                const userAgent = req.get('user-agent');
                yield otp_service_1.otpService.requestOtp(phone, purpose, ip, userAgent);
                res.json((0, api_response_1.successResponse)('If this phone number is eligible, a verification code has been sent.'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    verifyOtp(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone, otp, purpose } = req.body;
                const verificationToken = yield otp_service_1.otpService.verifyOtp(phone, otp, purpose);
                res.json((0, api_response_1.successResponse)('OTP verified successfully', { verificationToken }));
            }
            catch (error) {
                next(error);
            }
        });
    }
    register(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone, verificationToken, business } = req.body;
                const result = yield auth_service_1.authService.register({ phone, verificationToken, business });
                res.cookie('refreshToken', result.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                });
                res.status(201).json((0, api_response_1.successResponse)('Registration successful', {
                    accessToken: result.accessToken,
                    user: result.user,
                }));
            }
            catch (error) {
                next(error);
            }
        });
    }
    loginComplete(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { verificationToken } = req.body;
                const deviceName = req.get('x-device-name');
                const userAgent = req.get('user-agent');
                const ipAddress = req.ip || req.socket.remoteAddress;
                const result = yield auth_service_1.authService.loginComplete(verificationToken, {
                    deviceName,
                    userAgent,
                    ipAddress,
                });
                res.cookie('refreshToken', result.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                });
                res.json((0, api_response_1.successResponse)('Login successful', {
                    accessToken: result.accessToken,
                    user: result.user,
                }));
            }
            catch (error) {
                next(error);
            }
        });
    }
    refreshToken(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const refreshToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.refreshToken;
                if (!refreshToken) {
                    res.status(401).json({ success: false, message: 'Refresh token not provided', code: 'UNAUTHORIZED' });
                    return;
                }
                const userAgent = req.get('user-agent');
                const ipAddress = req.ip || req.socket.remoteAddress;
                const result = yield session_service_1.sessionService.rotateRefreshToken(refreshToken, userAgent, ipAddress);
                res.cookie('refreshToken', result.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                });
                res.json((0, api_response_1.successResponse)('Token refreshed', { accessToken: result.accessToken }));
            }
            catch (error) {
                next(error);
            }
        });
    }
    logout(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                const refreshToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.refreshToken;
                if (refreshToken) {
                    try {
                        yield session_service_1.sessionService.revokeSession(req.auth.sessionId, req.auth.userId, 'User logged out');
                    }
                    catch (_b) {
                        // Ignore if session already revoked
                    }
                }
                res.clearCookie('refreshToken', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                });
                res.json((0, api_response_1.successResponse)('Logged out successfully'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    logoutAll(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                yield session_service_1.sessionService.revokeAllUserSessions(req.auth.userId, 'Logged out from all devices');
                res.clearCookie('refreshToken', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                });
                res.json((0, api_response_1.successResponse)('Logged out from all devices'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    getMe(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                const user = yield auth_service_1.authService.getMe(req.auth.userId);
                res.json((0, api_response_1.successResponse)('User profile retrieved', user));
            }
            catch (error) {
                next(error);
            }
        });
    }
    getSessions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                const sessions = yield session_service_1.sessionService.getUserSessions(req.auth.userId, req.auth.sessionId);
                res.json((0, api_response_1.successResponse)('Sessions retrieved', sessions));
            }
            catch (error) {
                next(error);
            }
        });
    }
    revokeSession(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                const { sessionId } = req.params;
                yield session_service_1.sessionService.revokeSession(sessionId, req.auth.userId, 'Revoked by user');
                res.json((0, api_response_1.successResponse)('Session revoked'));
            }
            catch (error) {
                next(error);
            }
        });
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();

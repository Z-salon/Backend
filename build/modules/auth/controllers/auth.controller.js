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
                const { phone, password, business } = req.body;
                yield auth_service_1.authService.register({ phone, password, business });
                res.status(201).json((0, api_response_1.successResponse)('If this phone number is eligible, a verification code has been sent.'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    registerInvitation(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { password } = req.body;
                const { invitationToken } = req.params;
                yield auth_service_1.authService.registerInvitation(invitationToken, { password });
                res.status(201).json((0, api_response_1.successResponse)('If this phone number is eligible, a verification code has been sent.'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    registerVerify(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone, otp } = req.body;
                const deviceName = req.get('x-device-name');
                const userAgent = req.get('user-agent');
                const ipAddress = req.ip || req.socket.remoteAddress;
                const result = yield auth_service_1.authService.registerVerify(phone, otp, {
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
                res.json((0, api_response_1.successResponse)('Registration successful', {
                    accessToken: result.accessToken,
                    user: result.user,
                }));
            }
            catch (error) {
                next(error);
            }
        });
    }
    login(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone, password } = req.body;
                const deviceName = req.get('x-device-name');
                const userAgent = req.get('user-agent');
                const ipAddress = req.ip || req.socket.remoteAddress;
                const result = yield auth_service_1.authService.login(phone, password, {
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
    forgotPassword(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone } = req.body;
                const result = yield auth_service_1.authService.requestPasswordReset(phone);
                res.json((0, api_response_1.successResponse)(result.message));
            }
            catch (error) {
                next(error);
            }
        });
    }
    verifyPasswordReset(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { phone, otp } = req.body;
                const result = yield auth_service_1.authService.verifyPasswordReset(phone, otp);
                res.json((0, api_response_1.successResponse)('Password reset OTP verified', result));
            }
            catch (error) {
                next(error);
            }
        });
    }
    resetPassword(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { passwordResetToken, newPassword } = req.body;
                yield auth_service_1.authService.resetPassword(passwordResetToken, newPassword);
                res.json((0, api_response_1.successResponse)('Password reset successfully. Please log in again.'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    changePassword(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                const { currentPassword, newPassword } = req.body;
                yield auth_service_1.authService.changePassword(req.auth.userId, currentPassword, newPassword);
                res.json((0, api_response_1.successResponse)('Password changed successfully'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    changePhoneRequest(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                const { currentPassword, newPhone } = req.body;
                yield auth_service_1.authService.changePhoneRequest(req.auth.userId, currentPassword, newPhone);
                res.json((0, api_response_1.successResponse)('If the new phone is valid, a verification code has been sent.'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    changePhoneVerify(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.auth) {
                    res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
                    return;
                }
                const { newPhone, otp } = req.body;
                yield auth_service_1.authService.changePhoneVerify(req.auth.userId, newPhone, otp);
                res.json((0, api_response_1.successResponse)('Phone number updated successfully'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    resendOtp(req, res, next) {
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

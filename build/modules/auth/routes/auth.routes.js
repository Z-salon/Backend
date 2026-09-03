"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const authenticate_1 = require("../../../middlewares/authenticate");
const body_validator_1 = require("../../../utils/body-validator");
const auth_schemas_1 = require("../../../validation/auth.schemas");
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/v1/auth/otp/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request OTP for authentication or onboarding
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OtpRequest'
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post('/otp/request', (0, body_validator_1.bodyValidator)(auth_schemas_1.otpRequestSchema), auth_controller_1.authController.requestOtp.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify a one-time password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OtpVerify'
 *     responses:
 *       200:
 *         description: OTP verified successfully
 */
router.post('/otp/verify', (0, body_validator_1.bodyValidator)(auth_schemas_1.otpVerifySchema), auth_controller_1.authController.verifyOtp.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new business and user account with phone + password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration request created successfully
 */
router.post('/register', (0, body_validator_1.bodyValidator)(auth_schemas_1.registerSchema), auth_controller_1.authController.register.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/register/{invitationToken}/invitation:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new invited user account before accepting an invitation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InvitationRegisterRequest'
 *     responses:
 *       201:
 *         description: Invitation registration request created successfully
 */
router.post('/register/{invitationToken}/invitation', (0, body_validator_1.bodyValidator)(auth_schemas_1.invitationRegisterSchema), auth_controller_1.authController.registerInvitation.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/register/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify registration OTP and finalize account creation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterVerifyRequest'
 *     responses:
 *       200:
 *         description: Registration completed successfully
 */
router.post('/register/verify', (0, body_validator_1.bodyValidator)(auth_schemas_1.registerVerifySchema), auth_controller_1.authController.registerVerify.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with phone and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', (0, body_validator_1.bodyValidator)(auth_schemas_1.loginSchema), auth_controller_1.authController.login.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/login/complete:
 *   post:
 *     tags: [Auth]
 *     summary: Complete login with a verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginCompleteRequest'
 *     responses:
 *       200:
 *         description: Login completed successfully
 */
router.post('/login/complete', (0, body_validator_1.bodyValidator)(auth_schemas_1.loginCompleteSchema), auth_controller_1.authController.loginComplete.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/password/forgot:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset instructions sent
 */
router.post('/password/forgot', (0, body_validator_1.bodyValidator)(auth_schemas_1.forgotPasswordSchema), auth_controller_1.authController.forgotPassword.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/password/reset/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the password reset OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyPasswordResetRequest'
 *     responses:
 *       200:
 *         description: Password reset token verified
 */
router.post('/password/reset/verify', (0, body_validator_1.bodyValidator)(auth_schemas_1.verifyPasswordResetSchema), auth_controller_1.authController.verifyPasswordReset.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/password/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Reset the user's password with a verified token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successfully
 */
router.post('/password/reset', (0, body_validator_1.bodyValidator)(auth_schemas_1.resetPasswordSchema), auth_controller_1.authController.resetPassword.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/password/change:
 *   post:
 *     tags: [Auth]
 *     summary: Change the current authenticated user's password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post('/password/change', authenticate_1.authenticate, (0, body_validator_1.bodyValidator)(auth_schemas_1.changePasswordSchema), auth_controller_1.authController.changePassword.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/phone/change/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request a phone-number change verification code
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePhoneRequestRequest'
 *     responses:
 *       200:
 *         description: Phone change verification sent
 */
router.post('/phone/change/request', authenticate_1.authenticate, (0, body_validator_1.bodyValidator)(auth_schemas_1.changePhoneRequestSchema), auth_controller_1.authController.changePhoneRequest.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/phone/change/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the new phone number change
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePhoneVerifyRequest'
 *     responses:
 *       200:
 *         description: Phone number updated successfully
 */
router.post('/phone/change/verify', authenticate_1.authenticate, (0, body_validator_1.bodyValidator)(auth_schemas_1.changePhoneVerifySchema), auth_controller_1.authController.changePhoneVerify.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/otp/resend:
 *   post:
 *     tags: [Auth]
 *     summary: Resend an OTP for a supported purpose
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResendOtpRequest'
 *     responses:
 *       200:
 *         description: OTP resend request accepted
 */
router.post('/otp/resend', (0, body_validator_1.bodyValidator)(auth_schemas_1.resendOtpSchema), auth_controller_1.authController.resendOtp.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     responses:
 *       200:
 *         description: New tokens returned
 */
router.post('/refresh', auth_controller_1.authController.refreshToken.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out the current session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', authenticate_1.authenticate, auth_controller_1.authController.logout.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Log out all user sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions revoked
 */
router.post('/logout-all', authenticate_1.authenticate, auth_controller_1.authController.logoutAll.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile returned
 */
router.get('/me', authenticate_1.authenticate, auth_controller_1.authController.getMe.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: List active user sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 */
router.get('/sessions', authenticate_1.authenticate, auth_controller_1.authController.getSessions.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/sessions/{sessionId}:
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke a specific session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked successfully
 */
router.delete('/sessions/:sessionId', authenticate_1.authenticate, auth_controller_1.authController.revokeSession.bind(auth_controller_1.authController));
exports.default = router;

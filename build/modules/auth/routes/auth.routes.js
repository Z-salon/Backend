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
 *     summary: Register a new business and user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 */
router.post('/register', (0, body_validator_1.bodyValidator)(auth_schemas_1.registerSchema), auth_controller_1.authController.register.bind(auth_controller_1.authController));
/**
 * @openapi
 * /api/v1/auth/login/complete:
 *   post:
 *     tags: [Auth]
 *     summary: Complete phone login with verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verificationToken]
 *             properties:
 *               verificationToken:
 *                 type: string
 *                 example: token-123
 *     responses:
 *       200:
 *         description: Login completed successfully
 */
router.post('/login/complete', (0, body_validator_1.bodyValidator)(auth_schemas_1.loginCompleteSchema), auth_controller_1.authController.loginComplete.bind(auth_controller_1.authController));
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

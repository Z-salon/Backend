import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { bodyValidator } from '../../../utils/body-validator';
import {
  otpRequestSchema,
  otpVerifySchema,
  registerSchema,
  loginCompleteSchema,
} from '../../../validation/auth.schemas';

const router = Router();

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
router.post(
  '/otp/request',
  bodyValidator(otpRequestSchema),
  authController.requestOtp.bind(authController)
);

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
router.post(
  '/otp/verify',
  bodyValidator(otpVerifySchema),
  authController.verifyOtp.bind(authController)
);

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
router.post(
  '/register',
  bodyValidator(registerSchema),
  authController.register.bind(authController)
);

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
router.post(
  '/login/complete',
  bodyValidator(loginCompleteSchema),
  authController.loginComplete.bind(authController)
);

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
router.post(
  '/refresh',
  authController.refreshToken.bind(authController)
);

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
router.post(
  '/logout',
  authenticate,
  authController.logout.bind(authController)
);

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
router.post(
  '/logout-all',
  authenticate,
  authController.logoutAll.bind(authController)
);

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
router.get(
  '/me',
  authenticate,
  authController.getMe.bind(authController)
);

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
router.get(
  '/sessions',
  authenticate,
  authController.getSessions.bind(authController)
);

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
router.delete(
  '/sessions/:sessionId',
  authenticate,
  authController.revokeSession.bind(authController)
);

export default router;
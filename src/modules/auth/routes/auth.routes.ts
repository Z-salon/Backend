import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { bodyValidator } from '../../../utils/body-validator';
import {
  otpRequestSchema,
  otpVerifySchema,
  registerSchema,
  invitationRegisterSchema,
  registerVerifySchema,
  loginSchema,
  loginCompleteSchema,
  forgotPasswordSchema,
  verifyPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
  changePhoneRequestSchema,
  changePhoneVerifySchema,
  resendOtpSchema,
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
router.post(
  '/register',
  bodyValidator(registerSchema),
  authController.register.bind(authController)
);

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
router.post(
  '/register/{invitationToken}/invitation',
  bodyValidator(invitationRegisterSchema),
  authController.registerInvitation.bind(authController)
);

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
router.post(
  '/register/verify',
  bodyValidator(registerVerifySchema),
  authController.registerVerify.bind(authController)
);

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
router.post(
  '/login',
  bodyValidator(loginSchema),
  authController.login.bind(authController)
);

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
router.post(
  '/login/complete',
  bodyValidator(loginCompleteSchema),
  authController.loginComplete.bind(authController)
);

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
router.post(
  '/password/forgot',
  bodyValidator(forgotPasswordSchema),
  authController.forgotPassword.bind(authController)
);

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
router.post(
  '/password/reset/verify',
  bodyValidator(verifyPasswordResetSchema),
  authController.verifyPasswordReset.bind(authController)
);

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
router.post(
  '/password/reset',
  bodyValidator(resetPasswordSchema),
  authController.resetPassword.bind(authController)
);

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
router.post(
  '/password/change',
  authenticate,
  bodyValidator(changePasswordSchema),
  authController.changePassword.bind(authController)
);

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
router.post(
  '/phone/change/request',
  authenticate,
  bodyValidator(changePhoneRequestSchema),
  authController.changePhoneRequest.bind(authController)
);

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
router.post(
  '/phone/change/verify',
  authenticate,
  bodyValidator(changePhoneVerifySchema),
  authController.changePhoneVerify.bind(authController)
);

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
router.post(
  '/otp/resend',
  bodyValidator(resendOtpSchema),
  authController.resendOtp.bind(authController)
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
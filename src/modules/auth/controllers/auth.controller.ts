import { Request, Response, NextFunction } from 'express';
import { otpService } from '../services/otp.service';
import { authService } from '../services/auth.service';
import { sessionService } from '../services/session.service';
import { successResponse } from '../../../utils/api-response';
import { normalizePhone } from '../../../utils/phone';

export class AuthController {
  async requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, purpose } = req.body;
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      await otpService.requestOtp(phone, purpose, ip, userAgent);

      res.json(successResponse(
        'If this phone number is eligible, a verification code has been sent.'
      ));
    } catch (error) {
      next(error);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, otp, purpose } = req.body;

      const verificationToken = await otpService.verifyOtp(phone, otp, purpose);

      res.json(successResponse('OTP verified successfully', { verificationToken }));
    } catch (error) {
      next(error);
    }
  }

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, password, business } = req.body;

      await authService.register({ phone, password, business });

      res.status(201).json(successResponse('If this phone number is eligible, a verification code has been sent.'));
    } catch (error) {
      next(error);
    }
  }

  async registerInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, password } = req.body;

      await authService.registerInvitation({ phone, password });

      res.status(201).json(successResponse('If this phone number is eligible, a verification code has been sent.'));
    } catch (error) {
      next(error);
    }
  }

  async registerVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, otp } = req.body;
      const deviceName = req.get('x-device-name');
      const userAgent = req.get('user-agent');
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.registerVerify(phone, otp, {
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

      res.json(successResponse('Registration successful', {
        accessToken: result.accessToken,
        user: result.user,
      }));
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, password } = req.body;
      const deviceName = req.get('x-device-name');
      const userAgent = req.get('user-agent');
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.login(phone, password, {
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

      res.json(successResponse('Login successful', {
        accessToken: result.accessToken,
        user: result.user,
      }));
    } catch (error) {
      next(error);
    }
  }

  async loginComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { verificationToken } = req.body;
      const deviceName = req.get('x-device-name');
      const userAgent = req.get('user-agent');
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.loginComplete(verificationToken, {
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

      res.json(successResponse('Login successful', {
        accessToken: result.accessToken,
        user: result.user,
      }));
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.body;
      const result = await authService.requestPasswordReset(phone);
      res.json(successResponse(result.message));
    } catch (error) {
      next(error);
    }
  }

  async verifyPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, otp } = req.body;
      const result = await authService.verifyPasswordReset(phone, otp);
      res.json(successResponse('Password reset OTP verified', result));
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { passwordResetToken, newPassword } = req.body;
      await authService.resetPassword(passwordResetToken, newPassword);
      res.json(successResponse('Password reset successfully. Please log in again.'));
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.auth.userId, currentPassword, newPassword);
      res.json(successResponse('Password changed successfully'));
    } catch (error) {
      next(error);
    }
  }

  async changePhoneRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { currentPassword, newPhone } = req.body;
      await authService.changePhoneRequest(req.auth.userId, currentPassword, newPhone);
      res.json(successResponse('If the new phone is valid, a verification code has been sent.'));
    } catch (error) {
      next(error);
    }
  }

  async changePhoneVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { newPhone, otp } = req.body;
      await authService.changePhoneVerify(req.auth.userId, newPhone, otp);
      res.json(successResponse('Phone number updated successfully'));
    } catch (error) {
      next(error);
    }
  }

  async resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, purpose } = req.body;
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      await otpService.requestOtp(phone, purpose, ip, userAgent);
      res.json(successResponse('If this phone number is eligible, a verification code has been sent.'));
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        res.status(401).json({ success: false, message: 'Refresh token not provided', code: 'UNAUTHORIZED' });
        return;
      }

      const userAgent = req.get('user-agent');
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await sessionService.rotateRefreshToken(refreshToken, userAgent, ipAddress);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.json(successResponse('Token refreshed', { accessToken: result.accessToken }));
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const refreshToken = req.cookies?.refreshToken;

      if (refreshToken) {
        try {
          await sessionService.revokeSession(req.auth.sessionId, req.auth.userId, 'User logged out');
        } catch {
          // Ignore if session already revoked
        }
      }

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });

      res.json(successResponse('Logged out successfully'));
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      await sessionService.revokeAllUserSessions(req.auth.userId, 'Logged out from all devices');

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });

      res.json(successResponse('Logged out from all devices'));
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const user = await authService.getMe(req.auth.userId);

      res.json(successResponse('User profile retrieved', user));
    } catch (error) {
      next(error);
    }
  }

  async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const sessions = await sessionService.getUserSessions(req.auth.userId, req.auth.sessionId);

      res.json(successResponse('Sessions retrieved', sessions));
    } catch (error) {
      next(error);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { sessionId } = req.params;

      await sessionService.revokeSession(sessionId, req.auth.userId, 'Revoked by user');

      res.json(successResponse('Session revoked'));
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
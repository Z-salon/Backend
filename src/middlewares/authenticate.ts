import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../libs/jwt';
import { prisma } from '../libs/prisma';
import { ApiError, ErrorCodes } from '../utils/api-error';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authorization header missing', ErrorCodes.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      select: { id: true, userId: true, status: true, expiresAt: true },
    });

    if (!session) {
      throw new ApiError(401, 'Session not found', ErrorCodes.SESSION_REVOKED);
    }

    if (session.status !== 'ACTIVE') {
      throw new ApiError(401, 'Session has been revoked', ErrorCodes.SESSION_REVOKED);
    }

    if (session.expiresAt < new Date()) {
      throw new ApiError(401, 'Session has expired', ErrorCodes.SESSION_EXPIRED);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new ApiError(401, 'User not found', ErrorCodes.USER_NOT_FOUND);
    }

    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'User account is suspended', ErrorCodes.USER_SUSPENDED);
    }

    req.auth = {
      userId: user.id,
      sessionId: session.id,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  authenticate(req, res, next);
}
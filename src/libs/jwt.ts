import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}

export type TokenPayload = AccessTokenPayload | RefreshTokenPayload;

const accessSignOptions: SignOptions = {
  expiresIn: config.jwt.accessExpiresIn as SignOptions['expiresIn'],
};

const refreshSignOptions: SignOptions = {
  expiresIn: config.jwt.refreshExpiresIn as SignOptions['expiresIn'],
};

export function generateAccessToken(userId: string, sessionId: string): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    sessionId,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.accessSecret, accessSignOptions);
}

export function generateRefreshToken(userId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    sessionId,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwt.refreshSecret, refreshSignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('ACCESS_TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_ACCESS_TOKEN');
    }
    throw error;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }
    throw error;
  }
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
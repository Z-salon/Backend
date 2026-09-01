import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { config } from '../config/env';

export interface OtpResult {
  otp: string;
  otpHash: string;
}

export function generateOtp(): OtpResult {
  const length = config.otp.length;
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  
  const otp = randomInt(min, max + 1).toString();
  const otpHash = hashOtp(otp);
  
  return { otp, otpHash };
}

export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export function verifyOtp(otp: string, otpHash: string): boolean {
  const hash = hashOtp(otp);
  
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(otpHash));
  } catch {
    return false;
  }
}

export function generateVerificationToken(): string {
  const bytes = randomInt(0, 2**32 - 1).toString(16).padStart(8, '0');
  const timestamp = Date.now().toString(16);
  return `${timestamp}-${bytes}`;
}

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
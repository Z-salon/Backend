import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  REDIS_URL: z.string().min(1),

  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_EXPIRES_IN_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  OTP_RATE_LIMIT_IP_MAX: z.coerce.number().int().min(1).default(10),
  OTP_RATE_LIMIT_IP_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  OTP_RATE_LIMIT_PHONE_MAX: z.coerce.number().int().min(1).default(3),
  OTP_RATE_LIMIT_PHONE_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),

  COOKIE_SECRET: z.string().min(32),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().default(100),

  SESSION_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().default(60),
});

type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    console.error('❌ Invalid environment variables:\n', messages);
    process.exit(1);
  }
  throw error;
}

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  apiPrefix: env.API_PREFIX,

  database: {
    url: env.DATABASE_URL,
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  redis: {
    url: env.REDIS_URL,
  },

  otp: {
    length: env.OTP_LENGTH,
    expiresInMinutes: env.OTP_EXPIRES_IN_MINUTES,
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    rateLimit: {
      ip: {
        max: env.OTP_RATE_LIMIT_IP_MAX,
        windowMinutes: env.OTP_RATE_LIMIT_IP_WINDOW_MINUTES,
      },
      phone: {
        max: env.OTP_RATE_LIMIT_PHONE_MAX,
        windowMinutes: env.OTP_RATE_LIMIT_PHONE_WINDOW_MINUTES,
      },
    },
  },

  cors: {
    origin: env.CORS_ORIGIN,
    credentials: env.CORS_CREDENTIALS,
  },

  cookie: {
    secret: env.COOKIE_SECRET,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    domain: env.COOKIE_DOMAIN,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  session: {
    cleanupIntervalMinutes: env.SESSION_CLEANUP_INTERVAL_MINUTES,
  },

  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
};

export type Config = typeof config;
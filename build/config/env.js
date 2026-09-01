"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.coerce.number().default(3000),
    API_PREFIX: zod_1.z.string().default('/api/v1'),
    DATABASE_URL: zod_1.z.string().min(1),
    JWT_ACCESS_SECRET: zod_1.z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: zod_1.z.string().default('15m'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('30d'),
    REDIS_URL: zod_1.z.string().min(1),
    OTP_LENGTH: zod_1.z.coerce.number().int().min(4).max(8).default(6),
    OTP_EXPIRES_IN_MINUTES: zod_1.z.coerce.number().int().min(1).max(60).default(5),
    OTP_MAX_ATTEMPTS: zod_1.z.coerce.number().int().min(1).max(10).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: zod_1.z.coerce.number().int().min(0).max(3600).default(60),
    OTP_RATE_LIMIT_IP_MAX: zod_1.z.coerce.number().int().min(1).default(10),
    OTP_RATE_LIMIT_IP_WINDOW_MINUTES: zod_1.z.coerce.number().int().min(1).default(15),
    OTP_RATE_LIMIT_PHONE_MAX: zod_1.z.coerce.number().int().min(1).default(3),
    OTP_RATE_LIMIT_PHONE_WINDOW_MINUTES: zod_1.z.coerce.number().int().min(1).default(15),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:3000'),
    CORS_CREDENTIALS: zod_1.z.coerce.boolean().default(true),
    COOKIE_SECRET: zod_1.z.string().min(32),
    COOKIE_SECURE: zod_1.z.coerce.boolean().default(false),
    COOKIE_SAME_SITE: zod_1.z.enum(['strict', 'lax', 'none']).default('lax'),
    COOKIE_DOMAIN: zod_1.z.string().default('localhost'),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().int().default(900000),
    RATE_LIMIT_MAX_REQUESTS: zod_1.z.coerce.number().int().default(100),
    SESSION_CLEANUP_INTERVAL_MINUTES: zod_1.z.coerce.number().int().default(60),
});
let env;
try {
    env = envSchema.parse(process.env);
}
catch (error) {
    if (error instanceof zod_1.z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
        console.error('❌ Invalid environment variables:\n', messages);
        process.exit(1);
    }
    throw error;
}
exports.config = {
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

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
    FRONTEND_URL: zod_1.z.string().default('http://localhost:5173'),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:5173'),
    CORS_CREDENTIALS: zod_1.z.coerce.boolean().default(true),
    COOKIE_SECRET: zod_1.z.string().min(32),
    COOKIE_SECURE: zod_1.z.coerce.boolean().default(false),
    COOKIE_SAME_SITE: zod_1.z.enum(['strict', 'lax', 'none']).default('lax'),
    COOKIE_DOMAIN: zod_1.z.string().default('localhost'),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().int().default(900000),
    RATE_LIMIT_MAX_REQUESTS: zod_1.z.coerce.number().int().default(100),
    SESSION_CLEANUP_INTERVAL_MINUTES: zod_1.z.coerce.number().int().default(60),
    // SMS provider. Only 'console' is implemented; production delivery is not
    // enabled until a real provider is added to createSmsProvider().
    SMS_PROVIDER: zod_1.z.enum(['console']).default('console'),
    // Durable appointment reminder worker (PostgreSQL-backed, see
    // src/workers/reminder-worker.ts).
    REMINDER_WORKER_POLL_INTERVAL_MS: zod_1.z.coerce.number().int().min(500).default(30000),
    REMINDER_WORKER_BATCH_SIZE: zod_1.z.coerce.number().int().min(1).max(200).default(20),
    REMINDER_WORKER_LEASE_SECONDS: zod_1.z.coerce.number().int().min(30).default(120),
    REMINDER_MAX_ATTEMPTS: zod_1.z.coerce.number().int().min(1).max(20).default(5),
    REMINDER_RETRY_BASE_SECONDS: zod_1.z.coerce.number().int().min(1).default(60),
    REMINDER_RETRY_MAX_SECONDS: zod_1.z.coerce.number().int().min(1).default(3600),
    // The worker also runs the existing pending-appointment expiration job so all
    // background work lives in one durable process.
    REMINDER_WORKER_RUN_EXPIRATION: zod_1.z.coerce.boolean().default(true),
    REMINDER_EXPIRATION_INTERVAL_MINUTES: zod_1.z.coerce.number().int().min(1).default(5),
    /// Optional stable worker identifier used for claim/lease logging.
    REMINDER_WORKER_ID: zod_1.z.string().optional(),
    CLOUDINARY_URL: zod_1.z.string().optional(),
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
    frontendUrl: env.FRONTEND_URL,
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
    sms: {
        provider: env.SMS_PROVIDER,
    },
    reminderWorker: {
        pollIntervalMs: env.REMINDER_WORKER_POLL_INTERVAL_MS,
        batchSize: env.REMINDER_WORKER_BATCH_SIZE,
        leaseSeconds: env.REMINDER_WORKER_LEASE_SECONDS,
        maxAttempts: env.REMINDER_MAX_ATTEMPTS,
        retryBaseSeconds: env.REMINDER_RETRY_BASE_SECONDS,
        retryMaxSeconds: env.REMINDER_RETRY_MAX_SECONDS,
        runExpiration: env.REMINDER_WORKER_RUN_EXPIRATION,
        expirationIntervalMinutes: env.REMINDER_EXPIRATION_INTERVAL_MINUTES,
        workerId: env.REMINDER_WORKER_ID,
    },
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    cloudinaryUrl: env.CLOUDINARY_URL,
};

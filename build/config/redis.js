"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.connectRedis = connectRedis;
exports.disconnectRedis = disconnectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
const globalForRedis = globalThis;
function createRedisClient() {
    const client = new ioredis_1.default(env_1.config.redis.url, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
            if (times > 3) {
                console.error('❌ Redis: Max retries reached. Giving up.');
                return null;
            }
            return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
    });
    client.on('connect', () => {
        console.log('✅ Redis: Connected');
    });
    client.on('ready', () => {
        console.log('✅ Redis: Ready');
    });
    client.on('error', (error) => {
        console.error('❌ Redis Error:', error.message);
    });
    client.on('close', () => {
        console.warn('⚠️ Redis: Connection closed');
    });
    client.on('reconnecting', () => {
        console.log('🔄 Redis: Reconnecting...');
    });
    return client;
}
exports.redis = (_a = globalForRedis.redis) !== null && _a !== void 0 ? _a : createRedisClient();
if (process.env.NODE_ENV !== 'production')
    globalForRedis.redis = exports.redis;
function connectRedis() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield exports.redis.connect();
        }
        catch (error) {
            console.error('❌ Failed to connect to Redis:', error);
            throw error;
        }
    });
}
function disconnectRedis() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield exports.redis.quit();
            console.log('✅ Redis: Disconnected gracefully');
        }
        catch (error) {
            console.error('❌ Error disconnecting Redis:', error);
        }
    });
}
exports.default = exports.redis;

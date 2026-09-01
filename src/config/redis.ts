import Redis from 'ioredis';
import { config } from '../config/env';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const client = new Redis(config.redis.url, {
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

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    console.log('✅ Redis: Disconnected gracefully');
  } catch (error) {
    console.error('❌ Error disconnecting Redis:', error);
  }
}

export default redis;
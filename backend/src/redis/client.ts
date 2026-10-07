import Redis from 'ioredis';
import { env } from '../config/env';
import { errorContext, logger } from '../utils/logger';

/**
 * Shared Redis client used for caching and (later) rate limiting.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (error: Error) => {
  logger.error('Redis error', errorContext(error));
});

/**
 * Lightweight readiness probe: returns `true` when Redis answers PING.
 */
export async function checkRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully closes the Redis connection (used on shutdown).
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}

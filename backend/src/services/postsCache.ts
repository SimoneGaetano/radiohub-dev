import { redis } from '../redis/client';
import { logger } from '../utils/logger';

/** Cache key for the unfiltered `GET /api/posts` listing. */
export const POSTS_CACHE_KEY = 'posts:list';
/** TTL kept short: periodic sync + explicit invalidation handle freshness. */
export const POSTS_CACHE_TTL_SECONDS = 600;

/**
 * Read-through cache helpers for the posts listing. Every failure degrades to
 * "no cache": they log a warning and never throw, so the route always falls
 * back to PostgreSQL.
 */
export async function readPostsCache(): Promise<unknown[] | null> {
  try {
    const raw = await redis.get(POSTS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as unknown[];
  } catch (error) {
    logger.warn('Posts cache read failed, falling back to DB', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function writePostsCache(data: unknown[]): Promise<void> {
  try {
    await redis.set(
      POSTS_CACHE_KEY,
      JSON.stringify(data),
      'EX',
      POSTS_CACHE_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn('Posts cache write failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Drops the posts listing cache — called after every successful sync (B2). */
export async function invalidatePostsCache(): Promise<void> {
  try {
    await redis.del(POSTS_CACHE_KEY);
  } catch (error) {
    logger.warn('Posts cache invalidation failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
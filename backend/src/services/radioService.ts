import { env } from '../config/env';
import { redis } from '../redis/client';
import { errorContext, logger } from '../utils/logger';
import {
  fetchRadios,
  type RadioSearchParams,
  type RadioStation,
} from './radioSource';

export type CacheStatus = 'HIT' | 'MISS';

export interface RadioSearchResult {
  stations: RadioStation[];
  cache: CacheStatus;
}

/**
 * Deterministic cache key derived from the search query, e.g.
 * `radios:search:q=jazz&limit=20&page=1`.
 */
export function buildCacheKey(params: RadioSearchParams): string {
  return `radios:search:q=${params.q ?? ''}&limit=${params.limit}&page=${params.page}`;
}

async function readCache(key: string): Promise<RadioStation[] | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as RadioStation[];
  } catch (error) {
    // A cache failure must never break the request: degrade to a MISS.
    logger.warn('Cache read failed, falling back to upstream', {
      key,
      ...errorContext(error),
    });
    return null;
  }
}

async function writeCache(
  key: string,
  stations: RadioStation[],
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(stations), 'EX', ttlSeconds);
  } catch (error) {
    logger.warn('Cache write failed', { key, ...errorContext(error) });
  }
}

/**
 * Returns the stations for a given query, using Redis as a read-through cache.
 * On a cache miss the upstream source is queried and the result is stored with
 * a TTL (default 600s).
 */
export async function searchRadios(
  params: RadioSearchParams,
): Promise<RadioSearchResult> {
  const key = buildCacheKey(params);

  const cached = await readCache(key);
  if (cached) {
    return { stations: cached, cache: 'HIT' };
  }

  const stations = await fetchRadios(params);
  await writeCache(key, stations, env.RADIO_CACHE_TTL_SECONDS);

  return { stations, cache: 'MISS' };
}

import { env } from '../config/env';
import { redis } from '../redis/client';
import { errorContext, logger } from '../utils/logger';
import {
  fetchRadios,
  fetchStationsByIds,
  type RadioSearchParams,
  type RadioStation,
} from './radioSource';

export type CacheStatus = 'HIT' | 'MISS';

export interface RadioSearchResult {
  stations: RadioStation[];
  cache: CacheStatus;
}

/**
 * Deterministic cache key derived from the search parameters, e.g.
 * `radios:search:q=jazz&limit=20&page=1&cc=IT&order=votes`.
 * Every filter that changes the upstream result **must** be part of the key,
 * otherwise a cached list would be served for a different query.
 */
export function buildCacheKey(params: RadioSearchParams): string {
  const tags =
    params.tags && params.tags.length > 0 ? params.tags.join('|') : '';
  return [
    `radios:search:q=${params.q ?? ''}`,
    `limit=${params.limit}`,
    `page=${params.page}`,
    tags ? `tags=${tags}` : '',
    params.countryCode ? `cc=${params.countryCode}` : '',
    params.bitrateMin !== undefined ? `bitrateMin=${params.bitrateMin}` : '',
    params.order ? `order=${params.order}` : '',
  ]
    .filter((part) => part.length > 0)
    .join('&');
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

/**
 * Order-insensitive cache key for a set of station ids, e.g.
 * `radios:byids:uuid1,uuid2`.
 */
export function buildIdsCacheKey(ids: string[]): string {
  return `radios:byids:${[...ids].sort().join(',')}`;
}

/**
 * Resolves stations by id with the same read-through cache as the search: used
 * to render the favourites/recents that were created on another device.
 */
export async function getStationsByIds(
  ids: string[],
): Promise<RadioSearchResult> {
  const key = buildIdsCacheKey(ids);

  const cached = await readCache(key);
  if (cached) {
    return { stations: cached, cache: 'HIT' };
  }

  const stations = await fetchStationsByIds(ids);
  await writeCache(key, stations, env.RADIO_CACHE_TTL_SECONDS);

  return { stations, cache: 'MISS' };
}

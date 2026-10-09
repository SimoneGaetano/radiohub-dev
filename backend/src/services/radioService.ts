import { env } from '../config/env';
import { redis } from '../redis/client';
import { errorContext, logger } from '../utils/logger';
import {
  fetchRadios,
  fetchStationsByIds,
  type RadioFallbackInfo,
  type RadioProvider,
  type RadioSearchParams,
  type RadioStation,
} from './radioSource';

export type CacheStatus = 'HIT' | 'MISS';

export interface RadioSearchResult {
  stations: RadioStation[];
  cache: CacheStatus;
  /** Chi ha risposto alla ricerca (B1): `fm-world` oppure il fallback. */
  provider: RadioProvider;
  /** Valorizzato quando la ricerca **non** è passata da FM-World. */
  fallback: RadioFallbackInfo | null;
}

/**
 * Forma salvata in Redis per una ricerca: oltre alle stazioni conserva la
 * provenienza, altrimenti su una HIT non si saprebbe più chi ha risposto.
 */
interface CachedSearch {
  stations: RadioStation[];
  provider: RadioProvider;
  fallback: RadioFallbackInfo | null;
}

/**
 * La risoluzione per id (preferiti e cronologia) non ha un equivalente su
 * FM-World: quella rotta parla sempre con Radio Browser.
 */
const BY_IDS_PROVENANCE = {
  provider: 'radio-browser' as RadioProvider,
  fallback: null,
} as const;

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

/**
 * Legge una voce di cache e la valida con il parser della forma attesa: una voce
 * scritta da una versione precedente (o corrotta) diventa una MISS invece di un
 * errore a metà strada.
 */
async function readCache<T>(
  key: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    return parse(JSON.parse(raw) as unknown);
  } catch (error) {
    // A cache failure must never break the request: degrade to a MISS.
    logger.warn('Cache read failed, falling back to upstream', {
      key,
      ...errorContext(error),
    });
    return null;
  }
}

/** Risoluzione per id: in cache c'è il solo elenco delle stazioni. */
function parseStationList(value: unknown): RadioStation[] | null {
  return Array.isArray(value) ? (value as RadioStation[]) : null;
}

/**
 * Ricerca salvata in cache. Le voci scritte prima del fallback (B1) erano il
 * solo array delle stazioni: vengono lette come Radio Browser — che era l'unica
 * fonte — invece di essere scartate.
 */
function parseCachedSearch(value: unknown): CachedSearch | null {
  if (Array.isArray(value)) {
    return {
      stations: value as RadioStation[],
      provider: 'radio-browser',
      fallback: null,
    };
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { stations?: unknown }).stations)
  ) {
    const record = value as {
      stations: RadioStation[];
      provider?: unknown;
      fallback?: unknown;
    };
    return {
      stations: record.stations,
      provider: record.provider === 'fm-world' ? 'fm-world' : 'radio-browser',
      fallback: (record.fallback as RadioFallbackInfo | null) ?? null,
    };
  }

  return null;
}

async function writeCache(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
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

  const cached = await readCache(key, parseCachedSearch);
  if (cached) {
    return { ...cached, cache: 'HIT' };
  }

  const outcome = await fetchRadios(params);
  await writeCache(key, outcome, env.RADIO_CACHE_TTL_SECONDS);

  return { ...outcome, cache: 'MISS' };
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

  const cached = await readCache(key, parseStationList);
  if (cached) {
    return { stations: cached, cache: 'HIT', ...BY_IDS_PROVENANCE };
  }

  const stations = await fetchStationsByIds(ids);
  await writeCache(key, stations, env.RADIO_CACHE_TTL_SECONDS);

  return { stations, cache: 'MISS', ...BY_IDS_PROVENANCE };
}

import { URL } from 'node:url';
import { z } from 'zod';
import { env } from '../config/env';

/**
 * Normalised station shape exposed by the API (a small subset of the
 * upstream payload).
 */
export interface RadioStation {
  id: string;
  name: string;
  url: string;
  favicon: string;
  country: string;
  countryCode: string;
  language: string;
  tags: string[];
  votes: number;
  codec: string;
  bitrate: number;
}

export interface RadioSearchParams {
  q?: string;
  limit: number;
  page: number;
  /**
   * Candidate upstream tags (`tagList`), tried **in order** until one returns
   * results: Radio Browser tags are user-submitted and inconsistent
   * (`chillout` / `lounge` / `ambient`), so a single tag often returns nothing.
   */
  tags?: string[];
  /** ISO country code filter (`countrycode`), e.g. `IT`. */
  countryCode?: string;
  /** Minimum bitrate (`bitrateMin`). */
  bitrateMin?: number;
  /** Upstream ordering (`order`), e.g. `votes`. */
  order?: string;
}

/** The upstream source was too slow to answer (→ HTTP 504). */
export class UpstreamTimeoutError extends Error {
  constructor(message = 'Upstream radio source timed out') {
    super(message);
    this.name = 'UpstreamTimeoutError';
  }
}

/** The upstream source is unreachable or returned an invalid response (→ HTTP 502). */
export class UpstreamError extends Error {
  readonly status: number | undefined;

  constructor(message = 'Upstream radio source failed', status?: number) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

/**
 * Lenient schema for the subset of the Radio Browser station payload we use.
 * Unknown/missing fields fall back to sane defaults instead of failing.
 */
const upstreamStationSchema = z.object({
  stationuuid: z.string(),
  name: z.string(),
  url_resolved: z.string().catch(''),
  favicon: z.string().catch(''),
  country: z.string().catch(''),
  countrycode: z.string().catch(''),
  language: z.string().catch(''),
  tags: z.string().catch(''),
  votes: z.number().catch(0),
  codec: z.string().catch(''),
  bitrate: z.number().catch(0),
});

type UpstreamStation = z.infer<typeof upstreamStationSchema>;

const upstreamResponseSchema = z.array(upstreamStationSchema);

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'RadioHub/0.1.0',
  };

  if (env.RADIO_API_KEY) {
    headers['X-API-Key'] = env.RADIO_API_KEY;
  }

  return headers;
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'TimeoutError'
  );
}

function toStation(raw: UpstreamStation): RadioStation {
  return {
    id: raw.stationuuid,
    name: raw.name.trim(),
    url: raw.url_resolved,
    favicon: raw.favicon,
    country: raw.country,
    countryCode: raw.countrycode,
    language: raw.language,
    tags: raw.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    votes: raw.votes,
    codec: raw.codec,
    bitrate: raw.bitrate,
  };
}

/**
 * Calls the external radio source, mapping network problems to typed errors:
 * `UpstreamTimeoutError` (→ 504) and `UpstreamError` (→ 502).
 */
export async function fetchRadios(
  params: RadioSearchParams,
): Promise<RadioStation[]> {
  const candidates =
    params.tags && params.tags.length > 0
      ? params.tags.filter((tag) => tag.length > 0)
      : [undefined];

  let stations: RadioStation[] = [];
  for (const tag of candidates) {
    stations = await requestStations({ ...params, tag });
    if (stations.length > 0) {
      break;
    }
  }
  return stations;
}

/** Performs one upstream search request (no fallback logic). */
async function requestStations(params: {
  q?: string;
  limit: number;
  page: number;
  tag?: string;
  countryCode?: string;
  bitrateMin?: number;
  order?: string;
}): Promise<RadioStation[]> {
  const url = new URL('/json/stations/search', env.RADIO_API_BASE_URL);
  url.searchParams.set('hidebroken', 'true');
  url.searchParams.set('limit', String(params.limit));
  url.searchParams.set('offset', String((params.page - 1) * params.limit));
  if (params.q) {
    url.searchParams.set('name', params.q);
  }
  if (params.tag) {
    url.searchParams.set('tagList', params.tag);
  }
  if (params.countryCode) {
    url.searchParams.set('countrycode', params.countryCode);
  }
  if (params.bitrateMin !== undefined) {
    url.searchParams.set('bitrateMin', String(params.bitrateMin));
  }
  if (params.order) {
    url.searchParams.set('order', params.order);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(env.RADIO_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new UpstreamTimeoutError();
    }
    throw new UpstreamError('Unable to reach the upstream radio source');
  }

  if (!response.ok) {
    throw new UpstreamError(
      `Upstream radio source responded with status ${response.status}`,
      response.status,
    );
  }

  const payload: unknown = await response.json();
  const parsed = upstreamResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new UpstreamError('Unexpected payload from the upstream radio source');
  }

  return parsed.data.map(toStation);
}

/**
 * Resolves stations from their `stationuuid` (used to render the favourites and
 * the recents that exist on the server but were never seen on this device).
 *
 * Unlike `fetchRadios`, a malformed item is **skipped** instead of failing the
 * whole batch: a station removed upstream must not break the favourites list.
 */
export async function fetchStationsByIds(
  ids: string[],
): Promise<RadioStation[]> {
  if (ids.length === 0) {
    return [];
  }

  const url = new URL('/json/stations/byuuid', env.RADIO_API_BASE_URL);
  url.searchParams.set('uuids', ids.join(','));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(env.RADIO_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new UpstreamTimeoutError();
    }
    throw new UpstreamError('Unable to reach the upstream radio source');
  }

  if (!response.ok) {
    throw new UpstreamError(
      `Upstream radio source responded with status ${response.status}`,
      response.status,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new UpstreamError('Unexpected payload from the upstream radio source');
  }

  const stations: RadioStation[] = [];
  for (const item of payload) {
    const parsed = upstreamStationSchema.safeParse(item);
    if (parsed.success) {
      stations.push(toStation(parsed.data));
    }
  }
  return stations;
}

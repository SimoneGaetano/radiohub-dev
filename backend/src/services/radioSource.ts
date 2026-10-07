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
  const url = new URL('/json/stations/search', env.RADIO_API_BASE_URL);
  url.searchParams.set('hidebroken', 'true');
  url.searchParams.set('limit', String(params.limit));
  url.searchParams.set('offset', String((params.page - 1) * params.limit));
  if (params.q) {
    url.searchParams.set('name', params.q);
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

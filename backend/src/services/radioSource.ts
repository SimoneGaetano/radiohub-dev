import { URL } from 'node:url';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';

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

/* -------------------------------------------------------------------------- *
 * B1 — Fonti della ricerca radio
 *
 * La traccia indica **FM-World** come fonte della ricerca radio: il client più
 * sotto parla con `<base>/radios` (`query` + `limit`) e tiene il token lato
 * server. FM-World non copre due casi che Radio Browser invece copre — i filtri
 * per tag/paese/bitrate usati dalle pill e la risoluzione "per id" di preferiti
 * e cronologia — e quando non risponde si usa Radio Browser come fallback.
 * L'esito dichiara **chi ha risposto** e perché è stato usato il fallback: un
 * fallback silenzioso sarebbe indistinguibile da un provider che funziona.
 * -------------------------------------------------------------------------- */

/** Chi ha prodotto i risultati di una ricerca. */
export type RadioProvider = 'fm-world' | 'radio-browser';

/** Dettagli del fallback, esposti in `meta.fallback` per trasparenza. */
export interface RadioFallbackInfo {
  /** Provider che non ha risposto. */
  from: RadioProvider;
  /** Provider che ha risposto al suo posto. */
  to: RadioProvider;
  /** Motivo sintetico e stabile (es. `HTTP 403`, `timeout`). */
  reason: string;
}

/** Esito di una ricerca: i dati più la loro provenienza. */
export interface RadioSearchOutcome {
  stations: RadioStation[];
  provider: RadioProvider;
  fallback: RadioFallbackInfo | null;
}

const FM_WORLD: RadioProvider = 'fm-world';
const RADIO_BROWSER: RadioProvider = 'radio-browser';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Prima stringa non vuota fra i nomi di campo accettati. */
function pickString(
  item: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

/** Primo numero valido fra i nomi di campo accettati (0 se assente). */
function pickNumber(
  item: Record<string, unknown>,
  keys: readonly string[],
): number {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

/** I tag possono arrivare come array oppure come stringa separata da virgole. */
function pickTags(item: Record<string, unknown>): string[] {
  for (const key of ['tags', 'genres', 'genre', 'categories']) {
    const value = item[key];
    if (Array.isArray(value)) {
      return value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
  }
  return [];
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
 * Search on **Radio Browser**, walking the tag candidates in order. Network
 * problems are mapped to typed errors: `UpstreamTimeoutError` (→ 504) and
 * `UpstreamError` (→ 502).
 */
async function fetchRadiosFromRadioBrowser(
  params: RadioSearchParams,
): Promise<RadioStation[]> {
  const candidates =
    params.tags && params.tags.length > 0
      ? params.tags.filter((tag) => tag.length > 0)
      : [undefined];

  let stations: RadioStation[] = [];
  for (const tag of candidates) {
    stations = await searchViaRadioBrowser({ ...params, tag });
    if (stations.length > 0) {
      break;
    }
  }
  return stations;
}

/** One Radio Browser request, without the tag fallback chain. */
async function searchViaRadioBrowser(params: {
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

/* -------------------------------------------------------------------------- *
 * FM-World — fonte primaria della ricerca radio (B1)
 * -------------------------------------------------------------------------- */

/** L'elenco può arrivare come array nudo o dentro un contenitore. */
function extractItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (isRecord(payload)) {
    for (const key of ['data', 'radios', 'items', 'results', 'stations']) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value.filter(isRecord);
      }
    }
  }
  return [];
}

/**
 * Converte un elemento di FM-World nella stazione normalizzata.
 *
 * La forma esatta della risposta **non è stata verificabile**: l'endpoint non ha
 * documentazione pubblica e il token fornito con la traccia risponde
 * `403 Forbidden` (la misura è nel README). Il mapper è perciò volutamente
 * tollerante — prova i nomi di campo plausibili invece di imporre un unico
 * schema — e scarta solo gli elementi a cui manca l'essenziale (id, nome o URL
 * dello stream). Se nessun elemento è riconoscibile la ricerca non torna vuota:
 * `searchViaFmWorld` la tratta come contratto inatteso e lascia decidere il
 * fallback.
 */
function toFmWorldStation(item: Record<string, unknown>): RadioStation | null {
  const id = pickString(item, ['id', 'radioId', 'radio_id', 'stationId', 'uuid']);
  const name = pickString(item, ['name', 'title', 'radioName', 'label']);
  const url = pickString(item, [
    'streamUrl',
    'stream_url',
    'stream',
    'urlStream',
    'url',
    'audioUrl',
  ]);

  if (!id || !name || !url) {
    return null;
  }

  return {
    id,
    name,
    url,
    favicon: pickString(item, ['logo', 'logoUrl', 'image', 'imageUrl', 'favicon']),
    country: pickString(item, ['country', 'countryName', 'nation']),
    countryCode: pickString(item, ['countryCode', 'country_code', 'iso']).toUpperCase(),
    language: pickString(item, ['language', 'lang']),
    tags: pickTags(item),
    votes: pickNumber(item, ['votes', 'likes', 'rating']),
    codec: pickString(item, ['codec', 'format', 'audioCodec']),
    bitrate: pickNumber(item, ['bitrate', 'bitRate', 'kbps']),
  };
}

/** Una richiesta a FM-World (B1). Il fallback lo decide `fetchRadios`. */
async function searchViaFmWorld(
  params: RadioSearchParams,
): Promise<RadioStation[]> {
  const token = env.FM_WORLD_API_TOKEN;
  if (!token) {
    throw new UpstreamError('FM-World token is not configured', 401);
  }

  const base = env.FM_WORLD_API_BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${base}/radios`);
  url.searchParams.set('limit', String(params.limit));
  if (params.q) {
    url.searchParams.set('query', params.q);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'RadioHub/0.1.0',
      },
      signal: AbortSignal.timeout(env.RADIO_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new UpstreamTimeoutError('FM-World timed out');
    }
    throw new UpstreamError('Unable to reach FM-World');
  }

  if (!response.ok) {
    throw new UpstreamError(
      `FM-World responded with status ${response.status}`,
      response.status,
    );
  }

  const payload: unknown = await response.json();
  const items = extractItems(payload);
  if (items.length === 0 && !Array.isArray(payload)) {
    throw new UpstreamError('Unexpected payload from FM-World');
  }

  const stations: RadioStation[] = [];
  for (const item of items) {
    const station = toFmWorldStation(item);
    if (station) {
      stations.push(station);
    }
  }

  if (items.length > 0 && stations.length === 0) {
    throw new UpstreamError(
      'FM-World payload did not contain any recognisable station',
    );
  }

  return stations;
}

/**
 * Ricerca radio (B1): la fonte dipende da ciò che la query richiede.
 *
 * 1. **FM-World**, la fonte indicata dalla traccia, quando la ricerca è
 *    esprimibile con `query` + `limit` e il token è configurato;
 * 2. **Radio Browser** quando serve un filtro che FM-World non espone (tag,
 *    paese, bitrate, ordinamento — le pill di genere — oppure `page > 1`),
 *    quando il token manca, o quando FM-World non risponde (401/403, timeout,
 *    payload inatteso).
 *
 * Ogni uscita dal percorso primario è **dichiarata** in `fallback`, così la
 * risposta HTTP può dire chi ha risposto e perché: un fallback silenzioso
 * sarebbe indistinguibile da un provider che funziona.
 */
export async function fetchRadios(
  params: RadioSearchParams,
): Promise<RadioSearchOutcome> {
  const requiresBrowserSource =
    (params.tags?.length ?? 0) > 0 ||
    params.countryCode !== undefined ||
    params.bitrateMin !== undefined ||
    params.order !== undefined ||
    params.page > 1;

  const viaBrowser = async (reason: string): Promise<RadioSearchOutcome> => ({
    stations: await fetchRadiosFromRadioBrowser(params),
    provider: RADIO_BROWSER,
    fallback: { from: FM_WORLD, to: RADIO_BROWSER, reason },
  });

  if (requiresBrowserSource) {
    return viaBrowser('query needs filters FM-World does not expose');
  }

  if (!env.FM_WORLD_API_TOKEN) {
    return viaBrowser('FM-World token not configured');
  }

  try {
    return {
      stations: await searchViaFmWorld(params),
      provider: FM_WORLD,
      fallback: null,
    };
  } catch (error) {
    const reason =
      error instanceof UpstreamTimeoutError
        ? 'timeout'
        : error instanceof UpstreamError && error.status !== undefined
          ? `HTTP ${error.status}`
          : 'unreachable';

    // `errorContext(error)` non va sparso qui: contiene `message`, che nel
    // logger (`{ message, ...context }`) sovrascriverebbe il messaggio di questa
    // riga, lasciando nei log l'errore senza il motivo per cui è stato scritto.
    logger.warn('FM-World failed: falling back to Radio Browser', {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });

    return viaBrowser(reason);
  }
}

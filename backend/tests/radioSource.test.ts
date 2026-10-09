import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { env } from '../src/config/env';
import { fetchRadios, UpstreamError } from '../src/services/radioSource';
import { TEST_FM_WORLD_TOKEN } from './helpers/testEnv';

/**
 * B1 — la ricerca radio ha una fonte primaria (**FM-World**) e un fallback
 * (Radio Browser). Qui `fetch` è stubbata: nessuna chiamata reale, come in
 * `sync.test.ts`.
 *
 * La forma della risposta di FM-World **non è verificabile** — il token fornito
 * con la traccia risponde `403 Forbidden` — quindi i payload qui sotto sono
 * plausibili ma non osservati: servono a provare il mapper tollerante e la
 * politica di fallback, non a fissare un contratto che non conosciamo.
 */

/** Elemento FM-World plausibile, con i nomi di campo alternativi. */
const FM_WORLD_ITEM = {
  id: 'fm-1',
  name: 'Radio Jazz Italia',
  streamUrl: 'https://stream.example/jazz.mp3',
  logo: 'https://cdn.example/jazz.png',
  country: 'Italy',
  countryCode: 'it',
  tags: ['jazz', 'smooth'],
  bitrate: 128,
  codec: 'MP3',
};

/** Elemento Radio Browser (schema reale, già in uso dal fallback). */
const RADIO_BROWSER_ITEM = {
  stationuuid: 'rb-1',
  name: 'Radio Browser Jazz',
  url_resolved: 'https://stream.example/rb.mp3',
  favicon: '',
  country: 'Italy',
  countrycode: 'IT',
  language: 'italian',
  tags: 'jazz',
  votes: 10,
  codec: 'MP3',
  bitrate: 128,
};

/**
 * Sostituisce `fetch` con una risposta decisa in base all'URL chiamato: così un
 * test può far fallire FM-World e far rispondere Radio Browser.
 */
function stubFetch(reply: (url: string) => { status: number; body: unknown }) {
  const mock = vi.fn(async (input: unknown, _init?: unknown) => {
    const { status, body } = reply(String(input));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const isFmWorld = (url: string): boolean => url.includes('fm-world.com');
const isRadioBrowser = (url: string): boolean =>
  url.includes('radio-browser.info');

/** Motivo del fallback, con un errore esplicito se il fallback non c'è stato. */
function fallbackReason(outcome: {
  fallback: { reason: string } | null;
}): string {
  if (!outcome.fallback) {
    throw new Error('atteso un fallback, ma la ricerca è passata da FM-World');
  }
  return outcome.fallback.reason;
}

const originalToken = env.FM_WORLD_API_TOKEN;

/**
 * Il percorso primario deve essere davvero tentato: il token è fittizio e
 * `fetch` è stubbata in ogni test, quindi nessuna chiamata esce dalla macchina.
 * Il token viene impostato **qui** e non in `vitest.config.ts` per non far
 * uscire in rete i test di integrazione, che restano sulle fonti che già usavano.
 */
beforeAll(() => {
  env.FM_WORLD_API_TOKEN = TEST_FM_WORLD_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Ogni test riparte dallo stesso stato: il token dei test. Il valore reale
  // dell'ambiente viene rimesso una sola volta alla fine.
  env.FM_WORLD_API_TOKEN = TEST_FM_WORLD_TOKEN;
});

afterAll(() => {
  env.FM_WORLD_API_TOKEN = originalToken;
});

describe('fetchRadios — FM-World è la fonte primaria (B1)', () => {
  it('usa FM-World quando la ricerca è esprimibile con query + limit', async () => {
    const mock = stubFetch(() => ({
      status: 200,
      body: { data: [FM_WORLD_ITEM] },
    }));

    const outcome = await fetchRadios({ q: 'jazz', limit: 5, page: 1 });

    expect(outcome.provider).toBe('fm-world');
    expect(outcome.fallback).toBeNull();
    expect(outcome.stations).toHaveLength(1);
    expect(outcome.stations[0]).toMatchObject({
      id: 'fm-1',
      name: 'Radio Jazz Italia',
      url: 'https://stream.example/jazz.mp3',
      favicon: 'https://cdn.example/jazz.png',
      countryCode: 'IT',
      tags: ['jazz', 'smooth'],
      bitrate: 128,
      codec: 'MP3',
    });
    expect(mock).toHaveBeenCalledTimes(1);

    const firstCall = mock.mock.calls[0];
    expect(firstCall ? String(firstCall[0]) : '').toContain(
      '/client2/radios?limit=5&query=jazz',
    );
    const init = firstCall?.[1] as
      { headers?: Record<string, string> } | undefined;
    // Il token vive **solo lato server**: entra nell'header, mai nella risposta.
    expect(init?.headers?.Authorization).toBe(
      `Bearer ${env.FM_WORLD_API_TOKEN}`,
    );
  });

  it('accetta anche un array nudo con nomi di campo alternativi', async () => {
    stubFetch(() => ({
      status: 200,
      body: [
        {
          radioId: 'fm-2',
          title: 'Radio Due',
          stream_url: 'https://s.example/2',
        },
      ],
    }));

    const outcome = await fetchRadios({ q: 'due', limit: 5, page: 1 });

    expect(outcome.provider).toBe('fm-world');
    expect(outcome.stations[0]?.id).toBe('fm-2');
    expect(outcome.stations[0]?.name).toBe('Radio Due');
    expect(outcome.stations[0]?.url).toBe('https://s.example/2');
  });
});

describe('fetchRadios — fallback su Radio Browser (B1)', () => {
  it('passa al fallback quando FM-World risponde 403 (il token della traccia)', async () => {
    const mock = stubFetch((url) =>
      isFmWorld(url)
        ? { status: 403, body: { message: 'Forbidden' } }
        : { status: 200, body: [RADIO_BROWSER_ITEM] },
    );

    const outcome = await fetchRadios({ q: 'jazz', limit: 5, page: 1 });

    expect(outcome.provider).toBe('radio-browser');
    expect(fallbackReason(outcome)).toBe('HTTP 403');
    expect(outcome.fallback).toMatchObject({
      from: 'fm-world',
      to: 'radio-browser',
    });
    expect(outcome.stations[0]?.id).toBe('rb-1');
    expect(mock.mock.calls.some((call) => isFmWorld(String(call[0])))).toBe(
      true,
    );
    expect(
      mock.mock.calls.some((call) => isRadioBrowser(String(call[0]))),
    ).toBe(true);
  });

  it('passa al fallback quando FM-World va in timeout', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (isFmWorld(String(input))) {
          throw timeout;
        }
        return {
          ok: true,
          status: 200,
          json: async () => [RADIO_BROWSER_ITEM],
        };
      }),
    );

    const outcome = await fetchRadios({ q: 'jazz', limit: 5, page: 1 });

    expect(outcome.provider).toBe('radio-browser');
    expect(fallbackReason(outcome)).toBe('timeout');
  });

  it('tratta un payload non riconoscibile come contratto inatteso', async () => {
    stubFetch((url) =>
      isFmWorld(url)
        ? { status: 200, body: { items: [{ sconosciuto: true }] } }
        : { status: 200, body: [RADIO_BROWSER_ITEM] },
    );

    const outcome = await fetchRadios({ q: 'jazz', limit: 5, page: 1 });

    // Elementi presenti ma nessuno riconosciuto non significa "nessun
    // risultato": è un contratto diverso da quello atteso → fallback.
    expect(outcome.provider).toBe('radio-browser');
    expect(fallbackReason(outcome)).toBe('unreachable');
  });

  it('usa Radio Browser per i filtri che FM-World non espone (le pill)', async () => {
    const mock = stubFetch(() => ({ status: 200, body: [RADIO_BROWSER_ITEM] }));

    const outcome = await fetchRadios({
      limit: 50,
      page: 1,
      tags: ['jazz'],
      order: 'votes',
    });

    expect(outcome.provider).toBe('radio-browser');
    expect(fallbackReason(outcome)).toContain('filters');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(isFmWorld(String(mock.mock.calls[0]?.[0]))).toBe(false);
  });

  it('usa Radio Browser quando il token di FM-World non è configurato', async () => {
    env.FM_WORLD_API_TOKEN = undefined;
    stubFetch(() => ({ status: 200, body: [RADIO_BROWSER_ITEM] }));

    const outcome = await fetchRadios({ q: 'jazz', limit: 5, page: 1 });

    expect(outcome.provider).toBe('radio-browser');
    expect(fallbackReason(outcome)).toBe('FM-World token not configured');
  });

  it('propaga l errore quando anche il fallback fallisce (502/504 coerenti)', async () => {
    stubFetch(() => ({ status: 503, body: { message: 'down' } }));

    await expect(
      fetchRadios({ q: 'jazz', limit: 5, page: 1 }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});

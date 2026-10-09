import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import {
  mapFeedItem,
  syncNews,
  withCacheBuster,
} from '../src/services/newsSyncService';

/**
 * The sync is tested against a stubbed `fetch`, Prisma and Redis so the cases
 * stay deterministic (no network, no database) while still exercising the real
 * code paths of `syncNews`.
 */
const mocks = vi.hoisted(() => ({
  prisma: {
    post: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    postSummary: { deleteMany: vi.fn() },
  },
  invalidatePostsCache: vi.fn(),
}));

vi.mock('../src/db/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../src/services/postsCache', () => ({
  invalidatePostsCache: mocks.invalidatePostsCache,
}));

/** Feed element shaped like the WordPress REST payload. */
function feedElement(id: number, title: string) {
  return {
    id,
    status: 'publish',
    date_gmt: '2026-10-09T07:55:38',
    title: { rendered: title },
    content: { rendered: '<p>Testo</p>' },
  };
}

function stubFeed(items: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(items), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('withCacheBuster', () => {
  it('aggiunge un parametro quando l URL non ha query string', () => {
    expect(withCacheBuster('https://example.test/feed')).toMatch(
      /^https:\/\/example\.test\/feed\?_cb=\d+$/,
    );
  });

  it('usa & quando l URL ha già una query string', () => {
    expect(withCacheBuster('https://example.test/feed?limit=10')).toMatch(
      /^https:\/\/example\.test\/feed\?limit=10&_cb=\d+$/,
    );
  });
});

describe('syncNews (ingestion del feed notizie)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /**
   * Regression test for the stale-edge bug: with the plain URL the CDN edge kept
   * returning a ~12 h old snapshot (`x-cache: Hit`), so no new article was ever
   * imported. The request must therefore carry a cache-busting parameter.
   */
  it('richiede il feed con un cache-buster, non con l URL nudo', async () => {
    const fetchMock = stubFeed([]);

    await syncNews();

    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { signal?: AbortSignal },
    ];
    expect(requestedUrl).toMatch(/[?&]_cb=\d+$/);
    expect(requestedUrl).toContain(env.NEWS_FEED_URL);
    expect(requestedUrl).not.toBe(env.NEWS_FEED_URL);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('inserisce come nuovi gli articoli non ancora presenti', async () => {
    stubFeed([
      feedElement(5001, 'Articolo nuovo A'),
      feedElement(5002, 'Articolo nuovo B'),
    ]);
    mocks.prisma.post.findUnique.mockResolvedValue(null);
    mocks.prisma.post.create.mockResolvedValue({});

    const result = await syncNews();

    expect(result).toEqual({
      fetched: 2,
      created: 2,
      updated: 0,
      skipped: 0,
    });
    expect(mocks.prisma.post.create).toHaveBeenCalledTimes(2);
    expect(mocks.invalidatePostsCache).toHaveBeenCalledTimes(1);
  });

  it('aggiorna gli articoli esistenti senza duplicarli', async () => {
    stubFeed([feedElement(247380, 'Titolo aggiornato')]);
    mocks.prisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      title: 'Titolo vecchio',
      content: 'Testo',
    });
    mocks.prisma.post.update.mockResolvedValue({});

    const result = await syncNews();

    expect(result).toEqual({
      fetched: 1,
      created: 0,
      updated: 1,
      skipped: 0,
    });
    expect(mocks.prisma.post.create).not.toHaveBeenCalled();
    // Il testo è cambiato: il riassunto memorizzato viene scartato.
    expect(mocks.prisma.postSummary.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1' },
    });
    expect(mocks.prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: '247380' },
        data: expect.objectContaining({ summary: null }),
      }),
    );
  });
});

/**
 * Unit tests for the feed→Post mapping used by the periodic ingestion (B2).
 * No network, no database: they pin down normalisation and the "skip" rules.
 */
function feedItem(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 1234,
    status: 'publish',
    date_gmt: '2026-10-01T08:30:00',
    title: { rendered: 'Titolo di prova' },
    content: { rendered: '<p>Primo paragrafo</p>' },
    ...overrides,
  };
}

describe('mapFeedItem (ingestion del feed notizie)', () => {
  it('normalizza id esterno, titolo, contenuto e data GMT', () => {
    const item = mapFeedItem(feedItem());

    expect(item).not.toBeNull();
    expect(item?.externalId).toBe('1234');
    expect(item?.title).toBe('Titolo di prova');
    expect(item?.content).toBe('Primo paragrafo');
    // `date_gmt` senza fuso orario viene interpretata come UTC.
    expect(item?.publishedAt.toISOString()).toBe('2026-10-01T08:30:00.000Z');
  });

  it('decodifica le entità HTML e rimuove i tag dal contenuto', () => {
    const item = mapFeedItem(
      feedItem({
        title: { rendered: 'Radio &amp; TV: l&#8217;Italia che cambia' },
        content: {
          rendered:
            '<p>Prima riga</p><p>Seconda &quot;riga&quot;</p><br>Terza&nbsp;riga',
        },
      }),
    );

    expect(item?.title).toBe('Radio & TV: l’Italia che cambia');
    expect(item?.content).toBe('Prima riga\n\nSeconda "riga"\n\nTerza riga');
  });

  it('usa la data locale come fallback quando manca date_gmt', () => {
    const item = mapFeedItem(
      feedItem({ date_gmt: undefined, date: '2026-10-02T10:00:00+02:00' }),
    );

    expect(item?.publishedAt.toISOString()).toBe('2026-10-02T08:00:00.000Z');
  });

  it('accetta gli elementi senza campo status (feed minimali)', () => {
    const item = mapFeedItem(
      feedItem({ status: undefined, title: { rendered: 'Senza status' } }),
    );

    expect(item?.title).toBe('Senza status');
  });

  it('scarta gli elementi non pubblicabili', () => {
    // Non è un oggetto.
    expect(mapFeedItem(null)).toBeNull();
    expect(mapFeedItem('stringa')).toBeNull();
    expect(mapFeedItem(42)).toBeNull();
    // Nessun id, id non numerico, titolo mancante o vuoto.
    expect(mapFeedItem({ title: { rendered: 'Senza id' } })).toBeNull();
    expect(mapFeedItem(feedItem({ id: '1234' }))).toBeNull();
    expect(mapFeedItem(feedItem({ title: undefined }))).toBeNull();
    expect(mapFeedItem(feedItem({ title: { rendered: '   ' } }))).toBeNull();
    // Non pubblicato.
    expect(mapFeedItem(feedItem({ status: 'draft' }))).toBeNull();
    expect(mapFeedItem(feedItem({ status: 'private' }))).toBeNull();
  });
});

import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma, prisma } from '../src/db/prisma';
import { closeRedis, redis } from '../src/redis/client';
import { TEST_SYNC_API_KEY } from './helpers/testEnv';

/** Chiave attesa da POST /api/sync, iniettata da `vitest.config.ts`. */
const SYNC_KEY = TEST_SYNC_API_KEY;
const CACHE_KEY = 'posts:list';
/** externalId riservati ai test: nessuna collisione con gli id del feed reale. */
const TEST_IDS = ['990000001', '990000002'];

/** Feed finto: 2 post pubblicati + 1 bozza da scartare. */
const FEED: unknown[] = [
  {
    id: 990000001,
    status: 'publish',
    date_gmt: '2026-10-01T08:30:00',
    title: { rendered: 'Notizia di test A &amp; co.' },
    content: { rendered: '<p>Contenuto A</p>' },
  },
  {
    id: 990000002,
    status: 'publish',
    date_gmt: '2026-10-02T09:00:00',
    title: { rendered: 'Notizia di test B' },
    content: { rendered: '<p>Contenuto B</p>' },
  },
  {
    id: 990000003,
    status: 'draft',
    date_gmt: '2026-10-03T09:00:00',
    title: { rendered: 'Bozza di test' },
    content: { rendered: '<p>Bozza</p>' },
  },
];

let app: Express;

/** Sostituisce `fetch` con una risposta fissa (nessuna chiamata reale). */
function stubFeed(payload: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    })),
  );
}

beforeAll(async () => {
  app = createApp();
  await prisma.post.deleteMany({ where: { externalId: { in: TEST_IDS } } });
});

afterAll(async () => {
  await prisma.post.deleteMany({ where: { externalId: { in: TEST_IDS } } });
  await redis.del(CACHE_KEY);
  vi.unstubAllGlobals();
  await disconnectPrisma();
  await closeRedis();
});

describe('POST /api/sync (sincronizzazione manuale, B2)', () => {
  it('rifiuta le richieste senza header X-Sync-Key con 401', async () => {
    const response = await request(app).post('/api/sync');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid sync key');
  });

  it('rifiuta una chiave errata con 401', async () => {
    const response = await request(app)
      .post('/api/sync')
      .set('X-Sync-Key', 'chiave-sbagliata');

    expect(response.status).toBe(401);
  });

  it('importa i post, conta inseriti/aggiornati e invalida la cache', async () => {
    // Cache "sporca" prima della sync: deve sparire a fine sincronizzazione.
    await redis.set(CACHE_KEY, JSON.stringify([{ sentinel: true }]), 'EX', 60);

    stubFeed(FEED);
    const first = await request(app)
      .post('/api/sync')
      .set('X-Sync-Key', SYNC_KEY);

    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      fetched: 3,
      created: 2,
      updated: 0,
      skipped: 1,
    });
    expect(await redis.exists(CACHE_KEY)).toBe(0);

    const rows = await prisma.post.findMany({
      where: { externalId: { in: TEST_IDS } },
      orderBy: { externalId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe('Notizia di test A & co.');
    expect(rows[0]?.content).toBe('Contenuto A');
    expect(rows[0]?.publishedAt.toISOString()).toBe('2026-10-01T08:30:00.000Z');
  });

  it('è idempotente: una seconda sync aggiorna e non duplica (B2)', async () => {
    stubFeed(FEED);
    const second = await request(app)
      .post('/api/sync')
      .set('X-Sync-Key', SYNC_KEY);

    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({
      fetched: 3,
      created: 0,
      updated: 2,
      skipped: 1,
    });
    expect(
      await prisma.post.count({ where: { externalId: { in: TEST_IDS } } }),
    ).toBe(2);
  });

  it('risponde 502 quando il feed esterno fallisce', async () => {
    stubFeed({}, 503);
    const response = await request(app)
      .post('/api/sync')
      .set('X-Sync-Key', SYNC_KEY);

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('News feed synchronisation failed');
  });
});

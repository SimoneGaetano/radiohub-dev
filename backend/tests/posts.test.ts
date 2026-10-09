import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma, prisma } from '../src/db/prisma';
import { closeRedis, redis } from '../src/redis/client';

const CACHE_KEY = 'posts:list';
/** externalId riservati ai test: 3 post pubblicati con un titolo riconoscibile. */
const TEST_IDS = ['990000901', '990000902', '990000903'];
const TEST_TITLE = 'Post di prova filtro';

const app = createApp();

beforeAll(async () => {
  for (const [index, externalId] of TEST_IDS.entries()) {
    await prisma.post.upsert({
      where: { externalId },
      create: {
        externalId,
        title: `${TEST_TITLE} ${index + 1}`,
        content: 'Contenuto di prova per i test dei filtri.',
        publishedAt: new Date(`2026-07-0${index + 1}T10:00:00.000Z`),
      },
      update: {},
    });
  }
});

afterAll(async () => {
  await prisma.post.deleteMany({ where: { externalId: { in: TEST_IDS } } });
  await redis.del(CACHE_KEY);
  await disconnectPrisma();
  await closeRedis();
});

describe('GET /api/posts (filtri e cache, B2/B3)', () => {
  it('rifiuta items fuori dall intervallo 1-100 con 400', async () => {
    for (const query of ['?items=0', '?items=101', '?items=abc']) {
      const response = await request(app).get(`/api/posts${query}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid query parameters');
    }
  });

  it('rifiuta un titolo piu lungo di 200 caratteri con 400', async () => {
    const response = await request(app).get(
      `/api/posts?title=${'a'.repeat(201)}`,
    );

    expect(response.status).toBe(400);
  });

  it('filtra per titolo ignorando la cache (query filtrate vanno su DB)', async () => {
    // Cache "avvelenata" con un payload sentinella: non deve essere servita.
    await redis.set(
      CACHE_KEY,
      JSON.stringify([{ id: 'sentinel', externalId: 'sentinel' }]),
      'EX',
      60,
    );

    const response = await request(app).get(
      `/api/posts?title=${encodeURIComponent(TEST_TITLE)}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(TEST_IDS.length);
    expect(
      response.body.data.every(
        (post: { externalId: string }) => post.externalId !== 'sentinel',
      ),
    ).toBe(true);
  });

  it('limita il numero di post con items e con l alias limit', async () => {
    const byItems = await request(app).get('/api/posts?items=2');
    expect(byItems.status).toBe(200);
    expect(byItems.body.data).toHaveLength(2);

    const byLimit = await request(app).get('/api/posts?limit=2');
    expect(byLimit.status).toBe(200);
    expect(byLimit.body.data).toHaveLength(2);
  });

  it('serve la lista senza filtri dalla cache Redis (read-through)', async () => {
    // Parte da cache pulita: il test precedente lascia una chiave sentinella.
    await redis.del(CACHE_KEY);

    const first = await request(app).get('/api/posts');

    expect(first.status).toBe(200);
    expect(await redis.exists(CACHE_KEY)).toBe(1);
    expect(
      first.body.data.some(
        (post: { externalId: string }) => post.externalId === TEST_IDS[0],
      ),
    ).toBe(true);

    // Seconda chiamata identica: stesso payload, servito da Redis.
    const second = await request(app).get('/api/posts');
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
  });
});

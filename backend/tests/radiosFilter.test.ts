import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma } from '../src/db/prisma';
import { buildCacheKey } from '../src/services/radioService';
import { closeRedis } from '../src/redis/client';

const app = createApp();

/**
 * I due test che interrogano davvero la fonte esterna (Radio Browser) hanno un
 * timeout più alto del default di 5s: l'upstream può rispondere lentamente
 * (rate limit) e al primo giro la cache Redis è vuota. Il caso resta comunque
 * un test di validazione: verifica che i filtri non vengano rifiutati.
 */
const LIVE_SOURCE_TIMEOUT_MS = 15_000;

afterAll(async () => {
  await disconnectPrisma();
  await closeRedis();
});

describe('GET /api/radios — filtri server-side delle pill', () => {
  it('rifiuta un countryCode non valido con 400', async () => {
    for (const value of ['ITALIA', 'I', '123']) {
      const response = await request(app).get(
        `/api/radios?countryCode=${value}`,
      );
      expect(response.status).toBe(400);
    }
  });

  it('rifiuta bitrateMin fuori intervallo con 400', async () => {
    for (const value of ['0', 'abc', '99999']) {
      const response = await request(app).get(
        `/api/radios?bitrateMin=${value}`,
      );
      expect(response.status).toBe(400);
    }
  });

  it('rifiuta un order non supportato con 400', async () => {
    const response = await request(app).get('/api/radios?order=random');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid query parameters');
  });

  it(
    'accetta i filtri usati dalle pill (validazione)',
    async () => {
      const response = await request(app).get(
        '/api/radios?tag=jazz,blues,soul&countryCode=IT&order=votes&limit=5',
      );

      // Il contenuto dipende dall'upstream: qui interessa che la validazione passi.
      expect(response.status).not.toBe(400);
    },
    LIVE_SOURCE_TIMEOUT_MS,
  );

  /**
   * B1 names the parameter `query` while the frontend sends `q`: both must work
   * and the value must actually reach the upstream call (`meta.query`).
   */
  it(
    'accetta ?query= come alias di ?q= (B1)',
    async () => {
      const response = await request(app).get(
        '/api/radios?query=radio&limit=5',
      );

      expect(response.status).toBe(200);
      expect(response.body.meta.query).toBe('radio');
    },
    LIVE_SOURCE_TIMEOUT_MS,
  );
});

describe('buildCacheKey — ogni filtro entra nella chiave', () => {
  it('produce chiavi distinte per query distinte', () => {
    const base = { limit: 50, page: 1 };
    const keys = new Set([
      buildCacheKey({ ...base }),
      buildCacheKey({ ...base, tags: ['jazz'] }),
      buildCacheKey({ ...base, tags: ['jazz'], order: 'votes' }),
      buildCacheKey({ ...base, countryCode: 'IT', order: 'votes' }),
      buildCacheKey({ ...base, bitrateMin: 128, order: 'votes' }),
    ]);

    expect(keys.size).toBe(5);
  });

  it('mantiene il formato storico per la query di base', () => {
    expect(buildCacheKey({ limit: 50, page: 1 })).toBe(
      'radios:search:q=&limit=50&page=1',
    );
  });
});

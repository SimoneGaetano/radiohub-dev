import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  createRateLimiter,
  redisRateLimitStore,
  userOrIpKey,
  type RateLimitStore,
} from '../src/middleware/rateLimit';
import { closeRedis, redis } from '../src/redis/client';

/**
 * X6 — rate limiting.
 *
 * Due livelli di verifica: lo **store** su Redis (contatore e scadenza reali) e
 * il **middleware**, provato su un'app Express minima così i test non dipendono
 * dalle rotte applicative né dalle quote configurate in `vitest.config.ts`.
 */

/** App minima con una sola rotta protetta dal limiter da verificare. */
function appWith(limiter: RequestHandler) {
  const app = express();
  app.get('/limited', limiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

/** Store in memoria: contatori per chiave, senza Redis. */
function memoryStore(): { store: RateLimitStore; calls: () => number } {
  const counters = new Map<string, number>();
  let calls = 0;

  return {
    store: {
      async hit(key: string) {
        calls += 1;
        const count = (counters.get(key) ?? 0) + 1;
        counters.set(key, count);
        return { count, resetInSeconds: 30 };
      },
    },
    calls: () => calls,
  };
}

afterAll(async () => {
  await closeRedis();
});

describe('redisRateLimitStore', () => {
  const key = `test:store:${Date.now()}`;

  afterAll(async () => {
    await redis.del(`ratelimit:${key}`);
  });

  it('conta le richieste della finestra e imposta una scadenza', async () => {
    const first = await redisRateLimitStore.hit(key, 60);
    const second = await redisRateLimitStore.hit(key, 60);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(second.resetInSeconds).toBeGreaterThan(0);
    expect(second.resetInSeconds).toBeLessThanOrEqual(60);
  });
});

describe('createRateLimiter', () => {
  it('lascia passare fino alla quota, poi risponde 429 con header e dettaglio', async () => {
    const { store } = memoryStore();
    const app = appWith(
      createRateLimiter({ bucket: 'api', max: 2, windowSeconds: 60, store }),
    );

    const first = await request(app).get('/limited');
    const second = await request(app).get('/limited');
    const third = await request(app).get('/limited');

    expect(first.status).toBe(200);
    expect(first.headers['ratelimit-limit']).toBe('2');
    expect(first.headers['ratelimit-remaining']).toBe('1');

    expect(second.status).toBe(200);
    expect(second.headers['ratelimit-remaining']).toBe('0');

    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBe('30');
    expect(third.headers['ratelimit-remaining']).toBe('0');
    expect(third.body.error).toBe('Too many requests');
    expect(third.body.details.retryAfterSeconds).toBe(30);
  });

  it('tiene separate le quote di bucket diversi', async () => {
    const { store } = memoryStore();
    const first = appWith(
      createRateLimiter({ bucket: 'primo', max: 1, windowSeconds: 60, store }),
    );
    const second = appWith(
      createRateLimiter({
        bucket: 'secondo',
        max: 1,
        windowSeconds: 60,
        store,
      }),
    );

    expect((await request(first).get('/limited')).status).toBe(200);
    expect((await request(first).get('/limited')).status).toBe(429);
    expect((await request(second).get('/limited')).status).toBe(200);
  });

  it('conta per utente quando la chiave è userOrIpKey', async () => {
    const { store } = memoryStore();
    const limiter = createRateLimiter({
      bucket: 'ai-summary',
      max: 1,
      windowSeconds: 60,
      keyGenerator: userOrIpKey,
      store,
    });

    const app = express();
    app.get(
      '/user/:id',
      (req, _res, next) => {
        // Simula `authenticateJWTOptional`: il limiter sta dopo, quindi vede l'utente.
        req.user = { id: req.params.id ?? '', email: 'test@example.com' };
        next();
      },
      limiter,
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    expect((await request(app).get('/user/1')).status).toBe(200);
    expect((await request(app).get('/user/1')).status).toBe(429);
    // Un altro utente ha la sua quota: è il motivo per cui la quota dei
    // riassunti sta dopo il middleware di autenticazione.
    expect((await request(app).get('/user/2')).status).toBe(200);
  });

  it('se lo store non risponde lascia passare la richiesta (fail-open)', async () => {
    const failing: RateLimitStore = {
      hit: vi.fn().mockRejectedValue(new Error('redis giù')),
    };
    const app = appWith(
      createRateLimiter({
        bucket: 'guasto',
        max: 1,
        windowSeconds: 60,
        store: failing,
      }),
    );

    const response = await request(app).get('/limited');

    expect(response.status).toBe(200);
    expect(failing.hit).toHaveBeenCalledTimes(1);
  });

  it('normalizza l IPv4 scritto in forma IPv6: stessa quota da proxy e diretto', async () => {
    const { store } = memoryStore();
    const limiter = createRateLimiter({
      bucket: 'normalizzazione',
      max: 1,
      windowSeconds: 60,
      store,
    });

    const app = express();
    app.set('trust proxy', 1);
    app.get('/limited', limiter, (_req, res) => {
      res.json({ ok: true });
    });

    // Stesso client, due notazioni: via nginx (`X-Forwarded-For` con IPv4) e
    // socket dual-stack (`::ffff:`). Difetto trovato in verifica sulle chiavi
    // Redis: senza normalizzazione sarebbero due quote distinte.
    const viaProxy = await request(app)
      .get('/limited')
      .set('X-Forwarded-For', '203.0.113.7');
    const direct = await request(app)
      .get('/limited')
      .set('X-Forwarded-For', '::ffff:203.0.113.7');

    expect(viaProxy.status).toBe(200);
    expect(direct.status).toBe(429);
  });

  it('riapre la finestra alla scadenza (store reale su Redis)', async () => {
    const bucket = `test:finestra:${Date.now()}`;
    const app = appWith(
      createRateLimiter({ bucket, max: 1, windowSeconds: 1 }),
    );

    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect((await request(app).get('/limited')).status).toBe(200);

    const keys = await redis.keys(`ratelimit:${bucket}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });
});

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma } from '../src/db/prisma';
import { closeRedis } from '../src/redis/client';
import { afterAll } from 'vitest';

const app = createApp();

afterAll(async () => {
  await disconnectPrisma();
  await closeRedis();
});

describe('GET /api/radios/by-ids (validazione, B4)', () => {
  it('rifiuta la richiesta senza il parametro ids', async () => {
    const response = await request(app).get('/api/radios/by-ids');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid query parameters');
  });

  it('rifiuta una lista di soli separatori', async () => {
    const response = await request(app).get('/api/radios/by-ids?ids=,,,');

    expect(response.status).toBe(400);
  });

  it('rifiuta più di 50 id', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `uuid-${index}`).join(
      ',',
    );
    const response = await request(app).get(`/api/radios/by-ids?ids=${ids}`);

    expect(response.status).toBe(400);
    expect(response.body.details.ids).toBeDefined();
  });
});

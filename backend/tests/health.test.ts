import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma } from '../src/db/prisma';
import { closeRedis } from '../src/redis/client';

const app = createApp();

afterAll(async () => {
  await disconnectPrisma();
  await closeRedis();
});

describe('GET /api/health', () => {
  it('risponde 200 con lo stato del processo', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.uptime).toBe('number');
    expect(typeof response.body.timestamp).toBe('string');
  });
});

describe('GET /', () => {
  it('espone le informazioni dell API', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('RadioHub API');
  });
});

describe('GET /api/radios (validazione query)', () => {
  it('rifiuta limit superiore a 50 con 400', async () => {
    const response = await request(app).get('/api/radios?limit=100');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid query parameters');
  });

  it('accetta limit=50 senza errori di validazione', async () => {
    const response = await request(app).get('/api/radios?limit=50');

    expect(response.status).not.toBe(400);
  });
});

describe('GET /api/favorites (autenticazione)', () => {
  it('risponde 401 senza token Bearer', async () => {
    const response = await request(app).get('/api/favorites');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe(
      'Missing or malformed Authorization header',
    );
  });
});
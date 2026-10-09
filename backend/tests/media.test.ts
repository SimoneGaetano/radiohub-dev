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

describe('GET /api/media (proxy immagini con guardie SSRF)', () => {
  it('rifiuta la richiesta senza il parametro url', async () => {
    const response = await request(app).get('/api/media');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid query parameters');
  });

  it('rifiuta protocolli diversi da http/https', async () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com/logo.png',
      'javascript:alert(1)',
    ]) {
      const response = await request(app).get('/api/media').query({ url });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid or non-public image url');
    }
  });

  it('rifiuta host interni, loopback e indirizzi privati', async () => {
    for (const url of [
      'http://localhost/logo.png',
      'http://127.0.0.1/logo.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/logo.png',
      'http://192.168.1.10/logo.png',
      'http://[::1]/logo.png',
    ]) {
      const response = await request(app).get('/api/media').query({ url });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid or non-public image url');
    }
  });

  it('rifiuta un host non risolvibile', async () => {
    const response = await request(app)
      .get('/api/media')
      .query({ url: 'http://host-che-non-esiste-12345.invalid/logo.png' });

    expect(response.status).toBe(400);
  });
});

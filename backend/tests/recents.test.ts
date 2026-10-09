import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma, prisma } from '../src/db/prisma';
import { closeRedis } from '../src/redis/client';

const app = createApp();

/** Account di prova dedicato: eliminato in `afterAll` (cascade sui recenti). */
const email = `recents-test-${Date.now()}@radiohub.test`;
const password = 'password-di-prova-123';

let token = '';
let userId = '';

beforeAll(async () => {
  await request(app).post('/api/auth/register').send({ email, password });
  const login = await request(app).post('/api/auth/login').send({ email, password });
  token = login.body.token as string;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  userId = user?.id ?? '';
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await disconnectPrisma();
  await closeRedis();
});

/** Shortcut for the authenticated calls. */
function authed(request_: request.Test): request.Test {
  return request_.set('Authorization', `Bearer ${token}`);
}

describe('GET|POST|DELETE /api/recents (cronologia per utente)', () => {
  it('richiede l autenticazione', async () => {
    expect((await request(app).get('/api/recents')).status).toBe(401);
    expect(
      (await request(app).post('/api/recents').send({ radioId: 'x' })).status,
    ).toBe(401);
    expect((await request(app).delete('/api/recents')).status).toBe(401);
  });

  it('registra gli ascolti e li restituisce dal più recente', async () => {
    await authed(
      request(app).post('/api/recents').send({ radioId: 'radio-a' }),
    );
    await authed(
      request(app).post('/api/recents').send({ radioId: 'radio-b' }),
    );

    const response = await authed(request(app).get('/api/recents'));

    expect(response.status).toBe(200);
    expect(
      response.body.data.map((row: { radioId: string }) => row.radioId),
    ).toEqual(['radio-b', 'radio-a']);
  });

  it('non duplica una stazione riascoltata: la riporta in cima', async () => {
    await authed(
      request(app).post('/api/recents').send({ radioId: 'radio-a' }),
    );

    const response = await authed(request(app).get('/api/recents'));
    const ids = response.body.data.map((row: { radioId: string }) => row.radioId);

    expect(ids).toEqual(['radio-a', 'radio-b']);
    expect(ids.filter((id: string) => id === 'radio-a')).toHaveLength(1);
  });

  it('tiene al massimo 10 stazioni', async () => {
    for (let index = 0; index < 12; index += 1) {
      await authed(
        request(app).post('/api/recents').send({ radioId: `radio-${index}` }),
      );
    }

    const response = await authed(request(app).get('/api/recents'));

    expect(response.body.data).toHaveLength(10);
    expect(await prisma.recentPlay.count({ where: { userId } })).toBe(10);
  });

  it('valida il payload', async () => {
    const response = await authed(request(app).post('/api/recents').send({}));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });

  it('svuota la cronologia dell utente', async () => {
    const cleared = await authed(request(app).delete('/api/recents'));
    expect(cleared.status).toBe(204);

    const response = await authed(request(app).get('/api/recents'));
    expect(response.body.data).toHaveLength(0);
  });
});

import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma } from '../src/db/prisma';
import { closeRedis } from '../src/redis/client';

/**
 * X6 — refresh token: sessione breve, rinnovabile, revocabile.
 *
 * Sono test di integrazione: passano dalle rotte reali, quindi verificano anche
 * che il gettone finisca nello store Redis e che il riuso venga rifiutato.
 */

const app = createApp();

/** La tabella `User` è reale e condivisa: email diversa a ogni esecuzione. */
const email = `refresh-${Date.now()}@example.com`;
const password = 'password-sicura-123';

afterAll(async () => {
  await disconnectPrisma();
  await closeRedis();
});

/** Registra (o riusa) l'utente e apre una sessione completa. */
async function openSession(): Promise<{
  token: string;
  refreshToken: string;
  userId: string;
}> {
  // 409 alla seconda chiamata è atteso: l'utente esiste già.
  await request(app).post('/api/auth/register').send({ email, password });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  return {
    token: login.body.token as string,
    refreshToken: login.body.refreshToken as string,
    userId: login.body.user.id as string,
  };
}

describe('POST /api/auth/login (X6)', () => {
  it('restituisce access token e refresh token', async () => {
    const session = await openSession();

    expect(typeof session.token).toBe('string');
    expect(typeof session.refreshToken).toBe('string');
    expect(session.token).not.toBe(session.refreshToken);
  });
});

describe('POST /api/auth/refresh (X6)', () => {
  it('ruota la coppia di gettoni e consuma quello usato', async () => {
    const session = await openSession();

    const renewed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(renewed.status).toBe(200);
    expect(renewed.body.user.id).toBe(session.userId);
    expect(typeof renewed.body.refreshToken).toBe('string');
    // Il gettone è monouso: quello appena emesso è diverso da quello consumato.
    expect(renewed.body.refreshToken).not.toBe(session.refreshToken);

    // Il nuovo access token è utilizzabile: è la prova che il rinnovo serve a
    // qualcosa, non solo a cambiare una stringa.
    const favorites = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${renewed.body.token as string}`);
    expect(favorites.status).toBe(200);

    // Ripresentare il gettone consumato non funziona: la rotazione difende dal
    // riuso di un gettone intercettato.
    const replay = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(replay.status).toBe(401);
  });

  it('rifiuta un gettone sconosciuto con 401', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'get-inventato-che-non-esiste' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid or expired refresh token');
  });

  it('rifiuta un payload senza gettone con 400', async () => {
    const response = await request(app).post('/api/auth/refresh').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });
});

describe('POST /api/auth/logout (X6)', () => {
  it('revoca il gettone: non è più rinnovabile', async () => {
    const session = await openSession();

    const logout = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: session.refreshToken });
    expect(logout.status).toBe(204);

    const renewed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(renewed.status).toBe(401);
  });

  it('è idempotente e non rivela se il gettone esisteva', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'get-sconosciuto' });

    expect(response.status).toBe(204);
  });

  /**
   * Limite noto e dichiarato: il logout revoca la **rinnovazione**, non il JWT
   * già emesso. Il token di accesso resta valido fino alla sua scadenza (1 h):
   * è il prezzo di un access token senza stato, e il motivo per cui la scadenza
   * è breve. Una revoca immediata richiederebbe una blacklist consultata a ogni
   * richiesta (o sessioni server-side al posto dei JWT).
   */
  it('il JWT già emesso resta valido fino a scadenza (limite dichiarato)', async () => {
    const session = await openSession();

    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: session.refreshToken });

    const favorites = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${session.token}`);

    expect(favorites.status).toBe(200);
  });
});

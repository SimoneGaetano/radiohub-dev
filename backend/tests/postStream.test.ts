import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma } from '../src/db/prisma';
import { closeRedis } from '../src/redis/client';
import {
  addPostStreamClient,
  broadcastLocally,
  connectedClients,
  publishPostEvent,
  removePostStreamClient,
  startPostEventBus,
  stopPostEventBus,
} from '../src/realtime/postEvents';

/**
 * X5 — aggiornamento in tempo reale (SSE).
 *
 * Due livelli: il **registro** dei client (puro, con risposte finte) e il
 * **flusso vero** su HTTP reale — server su una porta effimera e `fetch` con
 * `AbortController` — che verifica anche la catena completa
 * Redis pub/sub → fan-out locale → frame SSE.
 */

const EVENT = { created: 3, updated: 1, at: '2026-10-10T10:00:00.000Z' };

describe('registro dei client SSE', () => {
  it('scrive il frame su tutti i client collegati', () => {
    const first = { write: vi.fn() } as unknown as Response;
    const second = { write: vi.fn() } as unknown as Response;

    addPostStreamClient(first);
    addPostStreamClient(second);
    expect(connectedClients()).toBe(2);

    const delivered = broadcastLocally(EVENT);

    expect(delivered).toBe(2);
    expect(first.write).toHaveBeenCalledWith(
      `event: posts\ndata: ${JSON.stringify(EVENT)}\n\n`,
    );
    expect(second.write).toHaveBeenCalledTimes(1);

    removePostStreamClient(first);
    removePostStreamClient(second);
    expect(connectedClients()).toBe(0);
  });

  it('toglie dal registro il client il cui socket è morto', () => {
    const dead = {
      write: vi.fn(() => {
        throw new Error('socket chiuso');
      }),
    } as unknown as Response;

    addPostStreamClient(dead);
    const delivered = broadcastLocally(EVENT);

    expect(delivered).toBe(0);
    expect(connectedClients()).toBe(0);
  });
});

describe('GET /api/posts/stream (X5)', () => {
  const app = createApp();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await startPostEventBus();
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await stopPostEventBus();
    await disconnectPrisma();
    await closeRedis();
  });

  it('apre il canale, riceve un evento pubblicato e libera il registro alla chiusura', async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/posts/stream`, {
      signal: controller.signal,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    // Senza questo header (e senza `proxy_buffering off` in nginx) il proxy
    // accumula la risposta e gli eventi non arrivano mai.
    expect(response.headers.get('x-accel-buffering')).toBe('no');

    if (!response.body) {
      throw new Error('Il flusso SSE non ha un corpo leggibile');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = '';

    const readUntil = async (
      marker: string,
      timeoutMs = 5000,
    ): Promise<void> => {
      const deadline = Date.now() + timeoutMs;
      while (!received.includes(marker) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        received += decoder.decode(value, { stream: true });
      }
    };

    await readUntil('event: ready');
    expect(received).toContain('retry: 10000');
    expect(received).toContain('event: ready');
    expect(connectedClients()).toBe(1);

    // Come fa il job di sync: pubblica sul canale Redis e il client collegato
    // deve riceverlo. È la catena completa, non solo il registro.
    await publishPostEvent({
      created: 2,
      updated: 0,
      at: '2026-10-10T11:00:00.000Z',
    });
    await readUntil('event: posts');

    expect(received).toContain('event: posts');
    expect(received).toContain('"created":2');

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Il client chiuso non resta nel registro: nessun evento scritto a vuoto.
    expect(connectedClients()).toBe(0);
  });
});

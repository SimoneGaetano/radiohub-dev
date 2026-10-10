import type { Response } from 'express';
import { redis } from '../redis/client';
import { errorContext, logger } from '../utils/logger';

/**
 * X5 — eventi in tempo reale sui post.
 *
 * Il trasporto è **SSE** e non WebSocket: il flusso è a senso unico (il server
 * annuncia, il client non deve inviare nulla), è HTTP puro — quindi passa dal
 * proxy e dagli header che già esistono — e il browser si riconnette da solo,
 * senza una libreria e senza codice di riconnessione.
 *
 * La distribuzione passa da **Redis pub/sub** e non da un array in memoria: il
 * backend può girare su più istanze (è la ragione per cui la cache di B3 sta in
 * Redis) e un client collegato all'istanza A deve ricevere un evento prodotto
 * dall'istanza B. Ogni istanza tiene i propri client SSE e ripubblica verso di
 * loro ciò che arriva dal canale.
 */

/** Canale Redis su cui viaggia l'evento. */
const CHANNEL = 'radiohub:posts';

/** Payload dell'evento: serializzato in JSON sul canale e dentro il frame SSE. */
export interface PostEventPayload {
  /** Post inseriti dall'ultima sincronizzazione. */
  created: number;
  /** Post aggiornati (il feed ha riscritto il testo). */
  updated: number;
  /** Istante della sincronizzazione, in ISO 8601. */
  at: string;
}

/** Client SSE collegati a **questa** istanza. */
const clients = new Set<Response>();
let subscriber: ReturnType<typeof redis.duplicate> | null = null;

/** Quanti client SSE sono collegati a questa istanza. */
export function connectedClients(): number {
  return clients.size;
}

/** Registra una risposta SSE fra i destinatari degli eventi. */
export function addPostStreamClient(res: Response): void {
  clients.add(res);
}

/** Deregistra una risposta SSE (chiusura del client o scrittura fallita). */
export function removePostStreamClient(res: Response): void {
  clients.delete(res);
}

/**
 * Scrive il frame SSE su tutti i client locali.
 * Un socket morto fa fallire `write`: viene tolto dal registro invece di restare
 * lì a fallire a ogni evento. Restituisce quanti client hanno ricevuto.
 */
export function broadcastLocally(payload: PostEventPayload): number {
  const frame = `event: posts\ndata: ${JSON.stringify(payload)}\n\n`;
  let delivered = 0;

  for (const client of clients) {
    try {
      client.write(frame);
      delivered += 1;
    } catch (error) {
      clients.delete(client);
      logger.warn('SSE client dropped', errorContext(error));
    }
  }

  return delivered;
}

/**
 * Pubblica l'evento sul canale. Non lancia mai: se Redis non risponde il sync
 * deve completare comunque — il tempo reale è un di più, e la lista si riallinea
 * da sola con il polling di sicurezza del frontend.
 */
export async function publishPostEvent(
  payload: PostEventPayload,
): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify(payload));
  } catch (error) {
    logger.warn('Post event could not be published', errorContext(error));
  }
}

/**
 * Apre la connessione di sottoscrizione.
 *
 * `duplicate()` e non il client condiviso: in `subscribe` la connessione si
 * dedica al canale e non può più servire la cache né i contatori del rate
 * limiting. Il client condiviso resta quindi libero.
 */
export async function startPostEventBus(): Promise<void> {
  if (subscriber) {
    return;
  }

  subscriber = redis.duplicate();
  subscriber.on('error', (error: Error) => {
    logger.error('Post event subscriber error', errorContext(error));
  });
  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== CHANNEL) {
      return;
    }
    try {
      const payload = JSON.parse(message) as PostEventPayload;
      const clients = broadcastLocally(payload);
      logger.info('Post event delivered', { ...payload, clients });
    } catch (error) {
      logger.warn('Malformed post event ignored', errorContext(error));
    }
  });

  await subscriber.subscribe(CHANNEL);
  logger.info('Post event bus ready', { channel: CHANNEL });
}

/** Chiude la sottoscrizione (shutdown). */
export async function stopPostEventBus(): Promise<void> {
  if (!subscriber) {
    return;
  }

  const closing = subscriber;
  subscriber = null;
  await closing.quit();
}

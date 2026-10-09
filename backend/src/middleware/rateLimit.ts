import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { redis } from '../redis/client';
import { errorContext, logger } from '../utils/logger';

/**
 * Rate limiting distribuito, contato su Redis (X6).
 *
 * Perché il contatore sta in Redis e non in memoria: il backend può girare su
 * più istanze — è la stessa ragione per cui la cache di B3 sta in Redis — e con
 * un contatore in memoria ogni istanza avrebbe la propria quota, cioè una quota
 * moltiplicata per il numero di istanze. In più il contatore sopravvive al
 * riavvio, quindi un cliente non recupera la quota riavviando l'app.
 *
 * La finestra è **fissa** (`INCR` + `TTL`), non sliding: costo O(1) per richiesta
 * e semantica banale. Il difetto noto è che a cavallo fra due finestre si possono
 * fare fino a `2 × max` richieste ravvicinate; è accettabile perché le finestre
 * applicative sono corte (un minuto) e la quota alta, ed è il motivo per cui il
 * limite stretto (credenziali) ha finestra lunga: 10 tentativi ogni 15 minuti
 * restano 10 anche nel caso peggiore.
 */

/** Esito di un colpo sul contatore di una finestra. */
export interface RateLimitHit {
  /** Richieste contate nella finestra corrente, questa inclusa. */
  count: number;
  /** Secondi che mancano alla riapertura della finestra. */
  resetInSeconds: number;
}

/**
 * Contatore dietro il limiter. È un'interfaccia invece del client Redis diretto
 * per una ragione pratica: i test iniettano uno store finto e verificano sia il
 * percorso "quota esaurita" sia il percorso "Redis giù" senza spegnere Redis.
 */
export interface RateLimitStore {
  hit(key: string, windowSeconds: number): Promise<RateLimitHit>;
}

/**
 * Store su Redis, con chiave `ratelimit:<bucket>:<identità>`.
 *
 * `INCR` è atomico, quindi due richieste concorrenti non leggono mai lo stesso
 * valore. Non è atomica solo la posa del TTL: due primissime richieste nello
 * stesso istante possono entrambe vedere `count === 1` e riscrivere la scadenza.
 * L'effetto è una finestra più lunga di qualche millisecondo — dichiarato qui e
 * nel README, non un modo per aggirare la quota.
 */
export const redisRateLimitStore: RateLimitStore = {
  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const redisKey = `ratelimit:${key}`;

    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    const ttl = await redis.ttl(redisKey);

    return {
      count,
      // `ttl` è -1 se la chiave non ha scadenza e -2 se non esiste più: in
      // entrambi i casi si considera la finestra intera.
      resetInSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  },
};

/** Configurazione di un limiter. */
export interface RateLimitOptions {
  /** Prefisso della chiave: un bucket per tipo di quota. */
  bucket: string;
  /** Richieste ammesse per finestra. */
  max: number;
  /** Durata della finestra, in secondi. */
  windowSeconds: number;
  /** Identità del chiamante; default: indirizzo IP. */
  keyGenerator?: (req: Request) => string;
  /** Store alternativo (usato dai test). */
  store?: RateLimitStore;
}

/**
 * Identifica il chiamante con l'indirizzo IP. Dietro nginx **non** è l'IP del
 * proxy: nginx accoda `$remote_addr` a `X-Forwarded-For` e Express, con
 * `trust proxy = 1` (vedi `app.ts`), legge l'ultimo valore dell'header — quello
 * aggiunto dal proxy. Un `X-Forwarded-For` falsificato dal client finisce più a
 * sinistra e viene ignorato, quindi non serve a spostare la chiave.
 */
export function ipKey(req: Request): string {
  // Node presenta un IPv4 su socket dual-stack come `::ffff:172.21.0.1`. Senza
  // normalizzare, lo stesso client otterrebbe due quote diverse passando dal
  // proxy (`172.21.0.1`) o da una connessione diretta (`::ffff:172.21.0.1`):
  // difetto trovato in verifica sulle chiavi Redis, non teorico.
  return (req.ip ?? 'unknown').replace(/^::ffff:/, '');
}

/** Identità per le quote per utente: l'utente autenticato, altrimenti l'IP. */
export function userOrIpKey(req: Request): string {
  return req.user ? `user:${req.user.id}` : `ip:${ipKey(req)}`;
}

/**
 * Costruisce il middleware. Quando la quota è esaurita risponde `429` con
 * `Retry-After` e gli header `RateLimit-*` (bozza IETF), così un client sa
 * quando riprovare invece di ritentare a caso.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { bucket, max, windowSeconds } = options;
  const keyGenerator = options.keyGenerator ?? ipKey;
  const store = options.store ?? redisRateLimitStore;

  return async function rateLimiter(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    let hit: RateLimitHit;

    try {
      hit = await store.hit(`${bucket}:${keyGenerator(req)}`, windowSeconds);
    } catch (error) {
      // Redis è un'ottimizzazione, non un requisito di servizio: se non risponde
      // la richiesta passa (fail-open) e lo si registra. Stessa scelta
      // dichiarata per la cache (B3): un Redis giù non spegne l'app.
      logger.warn('Rate limiter unavailable, request allowed', {
        ...errorContext(error),
        bucket,
      });
      next();
      return;
    }

    const remaining = Math.max(0, max - hit.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(hit.resetInSeconds));

    if (hit.count > max) {
      res.setHeader('Retry-After', String(hit.resetInSeconds));
      logger.warn('Request rate limited', {
        bucket,
        limit: max,
        windowSeconds,
        count: hit.count,
      });
      res.status(429).json({
        error: 'Too many requests',
        details: { retryAfterSeconds: hit.resetInSeconds },
      });
      return;
    }

    next();
  };
}

/**
 * Quota generale delle API (300 richieste al minuto per IP, da ambiente).
 * Montata **dopo** `/api/health` e `/api/docs`: gli healthcheck di Docker e la
 * pagina della documentazione non consumano la quota applicativa, e un client
 * rumoroso non può bloccare il controllo di salute del container.
 */
export const apiRateLimiter = createRateLimiter({
  bucket: 'api',
  max: env.RATE_LIMIT_API_MAX,
  windowSeconds: env.RATE_LIMIT_API_WINDOW_SECONDS,
});

/**
 * Quota stretta sulle credenziali (10 tentativi ogni 15 minuti per IP):
 * è la difesa da forza bruta sulle password e dalle registrazioni di massa.
 * Si somma alla quota generale, sul solo percorso di login/registrazione.
 */
export const authRateLimiter = createRateLimiter({
  bucket: 'auth',
  max: env.RATE_LIMIT_AUTH_MAX,
  windowSeconds: env.RATE_LIMIT_AUTH_WINDOW_SECONDS,
});

/**
 * Quota sulle generazioni di riassunti AI (20 ogni 5 minuti), contata **per
 * utente** quando la sessione è valida e per IP quando è un ospite. È la quota
 * che protegge il costo del modello: sta sulla rotta e dopo `authenticateJWTOptional`
 * proprio per poter usare l'identità dell'utente invece dell'IP di rete.
 */
export const summaryRateLimiter = createRateLimiter({
  bucket: 'ai-summary',
  max: env.RATE_LIMIT_AI_MAX,
  windowSeconds: env.RATE_LIMIT_AI_WINDOW_SECONDS,
  keyGenerator: userOrIpKey,
});

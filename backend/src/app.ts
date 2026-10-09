import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './routes/health';
import { radiosRouter } from './routes/radios';
import { authRouter } from './routes/auth';
import { docsRouter } from './routes/docs';
import { favoritesRouter } from './routes/favorites';
import { mediaRouter } from './routes/media';
import { postsRouter } from './routes/posts';
import { recentsRouter } from './routes/recents';
import { syncRouter } from './routes/sync';
import { apiRateLimiter, authRateLimiter } from './middleware/rateLimit';

/**
 * Builds and configures the Express application.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  /**
   * X6 — dietro nginx (vedi `frontend/nginx.conf`) il peer della connessione è
   * il container del proxy, non il browser: senza questa impostazione `req.ip`
   * sarebbe identico per tutti i client e il rate limiting diventerebbe un'unica
   * quota condivisa. nginx accoda l'IP reale a `X-Forwarded-For`
   * (`proxy_add_x_forwarded_for`), quindi con **un solo** hop fidato Express
   * legge l'ultimo valore dell'header — quello aggiunto dal proxy — e una testata
   * falsificata dal client non sposta la chiave.
   */
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ name: 'RadioHub API', version: '0.1.0' });
  });

  app.use('/api', healthRouter);
  // B5: OpenAPI spec + RapiDoc UI at /api/docs.
  app.use('/api', docsRouter);

  /**
   * X6 — rate limiting. Le quote sono montate **dopo** health e docs, così
   * healthcheck e documentazione restano fuori dalla quota applicativa; quella
   * sulle credenziali si aggiunge a quella generale sul solo percorso di
   * login/registrazione. La quota sui riassunti AI sta invece nella rotta
   * (`routes/posts.ts`), perché deve contare per utente e non per IP.
   */
  app.use('/api', apiRateLimiter);
  app.use('/api/auth/login', authRateLimiter);
  app.use('/api/auth/register', authRateLimiter);

  app.use('/api', radiosRouter);
  app.use('/api', authRouter);
  app.use('/api', favoritesRouter);
  app.use('/api', recentsRouter);
  app.use('/api', mediaRouter);
  app.use('/api', postsRouter);
  app.use('/api', syncRouter);

  return app;
}

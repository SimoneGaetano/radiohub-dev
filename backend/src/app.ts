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

/**
 * Builds and configures the Express application.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ name: 'RadioHub API', version: '0.1.0' });
  });

  app.use('/api', healthRouter);
  app.use('/api', radiosRouter);
  app.use('/api', authRouter);
  app.use('/api', favoritesRouter);
  app.use('/api', recentsRouter);
  app.use('/api', mediaRouter);
  app.use('/api', postsRouter);
  app.use('/api', syncRouter);
  // B5: OpenAPI spec + RapiDoc UI at /api/docs.
  app.use('/api', docsRouter);

  return app;
}

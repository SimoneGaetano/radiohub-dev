import { createApp } from './app';
import { env } from './config/env';
import { closeDatabase } from './db/pool';
import { disconnectPrisma } from './db/prisma';
import { runNewsSyncSafely } from './services/newsSyncService';
import { closeRedis } from './redis/client';
import { logger } from './utils/logger';

const app = createApp();

/** Periodic news-feed sync (B2); cleared on shutdown. */
let newsSyncTimer: NodeJS.Timeout | null = null;

const server = app.listen(env.PORT, () => {
  logger.info('API listening', { port: env.PORT, env: env.NODE_ENV });
  logger.info('Registered route: GET /api/posts');
  logger.info('Registered route: POST /api/posts/:id/summary');

  // B2: read the external news feed once at startup, then periodically.
  void runNewsSyncSafely();
  newsSyncTimer = setInterval(() => {
    void runNewsSyncSafely();
  }, env.NEWS_SYNC_INTERVAL_SECONDS * 1000);
  newsSyncTimer.unref();
});

/**
 * Graceful shutdown: stop accepting connections, close resources, then exit.
 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info('Shutdown signal received, closing server', { signal });

  if (newsSyncTimer) {
    clearInterval(newsSyncTimer);
    newsSyncTimer = null;
  }

  server.close(() => {
    void Promise.allSettled([
      disconnectPrisma(),
      closeDatabase(),
      closeRedis(),
    ]).then(() => process.exit(0));
  });

  // Force-exit if graceful shutdown takes too long.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

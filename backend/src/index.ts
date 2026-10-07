import { createApp } from './app';
import { env } from './config/env';
import { closeDatabase } from './db/pool';
import { disconnectPrisma } from './db/prisma';
import { closeRedis } from './redis/client';
import { logger } from './utils/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info('API listening', { port: env.PORT, env: env.NODE_ENV });
});

/**
 * Graceful shutdown: stop accepting connections, close resources, then exit.
 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info('Shutdown signal received, closing server', { signal });

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

import { Router } from 'express';
import { checkPrisma } from '../db/prisma';
import { checkRedis } from '../redis/client';

export const healthRouter = Router();

/**
 * Liveness probe: the process is up and serving requests.
 */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe: checks the required dependencies (Postgres + Redis).
 */
healthRouter.get('/health/ready', async (_req, res) => {
  const [database, cache] = await Promise.all([checkPrisma(), checkRedis()]);
  const ready = database && cache;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not-ready',
    dependencies: {
      database: database ? 'up' : 'down',
      redis: cache ? 'up' : 'down',
    },
  });
});

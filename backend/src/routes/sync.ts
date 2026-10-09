import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env';
import {
  isNewsSyncRunning,
  NewsSyncInProgressError,
  syncNews,
} from '../services/newsSyncService';
import { errorContext, logger } from '../utils/logger';

export const syncRouter = Router();

/** Length-safe constant-time comparison for the shared sync secret. */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * POST /api/sync — forces a manual synchronisation of the external news feed
 * (B2). Protected by the `X-Sync-Key` header matching `SYNC_API_KEY`; when the
 * key is not configured the endpoint is disabled (503, fail-closed).
 */
syncRouter.post('/sync', async (req, res) => {
  if (!env.SYNC_API_KEY) {
    res.status(503).json({
      error: 'Sync is disabled: SYNC_API_KEY is not configured',
    });
    return;
  }

  const provided = req.get('x-sync-key') ?? '';
  if (!safeEqual(provided, env.SYNC_API_KEY)) {
    res.status(401).json({ error: 'Invalid sync key' });
    return;
  }

  if (isNewsSyncRunning()) {
    res.status(409).json({ error: 'A news sync is already in progress' });
    return;
  }

  try {
    const result = await syncNews();
    res.json({ data: result });
  } catch (error) {
    if (error instanceof NewsSyncInProgressError) {
      res.status(409).json({ error: error.message });
      return;
    }
    logger.error('Manual news sync failed', errorContext(error));
    res.status(502).json({ error: 'News feed synchronisation failed' });
  }
});

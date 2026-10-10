import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { authenticateJWTOptional } from '../middleware/authenticateJWT';
import { summaryRateLimiter } from '../middleware/rateLimit';
import { summaryService } from '../services/summaryService';
import {
  invalidatePostsCache,
  readPostsCache,
  writePostsCache,
} from '../services/postsCache';
import { errorContext, logger } from '../utils/logger';
import {
  addPostStreamClient,
  connectedClients,
  removePostStreamClient,
} from '../realtime/postEvents';

export const postsRouter = Router();

/** Optional list filters from the spec (B2): partial `title` and `items` limit.
 * `limit` is accepted as a documented alias of `items` for convenience. */
const postsQuerySchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    items: z.coerce.number().int().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform(({ title, items, limit }) => ({ title, take: items ?? limit }));

/** Lists the news posts stored in the database. For signed-in users the summary
 * column carries **their own** summary; guests get the shared cache. The Redis
 * cache is used only for guests (an authenticated response is per-user, so it
 * must never be shared). */
postsRouter.get('/posts', authenticateJWTOptional, async (req, res) => {
  const parsed = postsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { title, take } = parsed.data;
  const userId = req.user?.id;
  // Only the "plain" guest listing is cached: filtered/limited queries and
  // per-user listings always hit PostgreSQL.
  const useCache = !userId && title === undefined && take === undefined;

  try {
    if (useCache) {
      const cached = await readPostsCache();
      if (cached) {
        res.json({ data: cached });
        return;
      }
    }

    let data: unknown[];
    if (userId) {
      const rows = await prisma.post.findMany({
        where:
          title === undefined
            ? {}
            : { title: { contains: title, mode: 'insensitive' } },
        orderBy: { publishedAt: 'desc' },
        ...(take === undefined ? {} : { take }),
        select: {
          id: true,
          externalId: true,
          title: true,
          content: true,
          publishedAt: true,
          createdAt: true,
          summaries: { where: { userId }, select: { summary: true } },
        },
      });
      // The list exposes one `summary` per post: the user's own when present.
      data = rows.map(({ summaries, ...post }) => ({
        ...post,
        summary: summaries[0]?.summary ?? null,
      }));
    } else {
      const guestRows = await prisma.post.findMany({
        where:
          title === undefined
            ? {}
            : { title: { contains: title, mode: 'insensitive' } },
        orderBy: { publishedAt: 'desc' },
        ...(take === undefined ? {} : { take }),
        select: {
          id: true,
          externalId: true,
          title: true,
          content: true,
          publishedAt: true,
          createdAt: true,
          summary: true,
        },
      });
      data = guestRows;
    }

    if (useCache) {
      await writePostsCache(data);
    }
    res.json({ data });
  } catch (error) {
    logger.error('Unexpected error while listing posts', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Intervallo dell'heartbeat del flusso SSE. Deve restare **sotto** il
 * `proxy_read_timeout` del proxy (60 s di default in nginx), altrimenti il proxy
 * considera la connessione inattiva e la chiude.
 */
const SSE_HEARTBEAT_MS = 25_000;

/**
 * X5 — flusso di eventi (SSE) sui post nuovi.
 *
 * Perché SSE e non WebSocket: il flusso è a senso unico, è HTTP puro (nessuna
 * libreria, nessun upgrade di protocollo da configurare nel proxy) e il browser
 * si **riconnette da solo** rispettando il `retry` annunciato qui.
 *
 * `X-Accel-Buffering: no` (+ `proxy_buffering off` in `frontend/nginx.conf`):
 * senza l'uno o l'altro il proxy accumula la risposta e gli eventi arrivano solo
 * alla chiusura della connessione, cioè mai. L'heartbeat è un **commento** SSE
 * (una riga che inizia con `:`): non genera eventi e non disturba il client, ma
 * tiene viva la connessione.
 */
postsRouter.get('/posts/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // `retry` = attesa prima della riconnessione automatica del browser; l'evento
  // `ready` conferma al client (e a chi legge i log) che il canale è aperto.
  res.write('retry: 10000\n\n');
  res.write(
    `event: ready\ndata: ${JSON.stringify({ clients: connectedClients() + 1 })}\n\n`,
  );

  addPostStreamClient(res);
  logger.info('SSE client connected', { clients: connectedClients() });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, SSE_HEARTBEAT_MS);
  heartbeat.unref();

  req.on('close', () => {
    clearInterval(heartbeat);
    removePostStreamClient(res);
    logger.info('SSE client disconnected', { clients: connectedClients() });
  });
});

/**
 * Returns the AI summary of a post: reads it from the database when already
 * present, otherwise generates it with the configured provider and persists it.
 * Signed-in users get their **own** summary row; guests share the public cache
 * on `Post.summary`. Later requests never call the model again (A1).
 *
 * Exposed as `GET` (as specified in the brief) **and** `POST`: the first call
 * has a side effect, so the SPA uses POST, while GET stays for spec compliance
 * and for plain browser/curl usage.
 */
async function sendSummary(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const result = await summaryService.summarize(id, req.user?.id);
    if (!result) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    if (result.generated) {
      // The summary travels inside the cached list payload (B3): drop the cache
      // so the next GET /api/posts shows the freshly generated text instead of
      // the stale "summary: null" still stored in Redis.
      await invalidatePostsCache();
    }
    res.json({ data: result });
  } catch (error) {
    logger.error(
      'Unexpected error while generating summary',
      errorContext(error),
    );
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * X6 — la generazione del riassunto è l'unica chiamata che ha un costo
 * (il modello AI): è la rotta con la sua quota, montata **dopo** il middleware
 * di autenticazione così il contatore è per utente e non per IP — un'intera rete
 * aziendale non deve condividere la quota di un singolo.
 */
postsRouter.get(
  '/posts/:id/summary',
  authenticateJWTOptional,
  summaryRateLimiter,
  sendSummary,
);
postsRouter.post(
  '/posts/:id/summary',
  authenticateJWTOptional,
  summaryRateLimiter,
  sendSummary,
);

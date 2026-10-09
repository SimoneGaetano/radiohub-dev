import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { authenticateJWTOptional } from '../middleware/authenticateJWT';
import { summaryService } from '../services/summaryService';
import {
  invalidatePostsCache,
  readPostsCache,
  writePostsCache,
} from '../services/postsCache';
import { errorContext, logger } from '../utils/logger';

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

postsRouter.get('/posts/:id/summary', authenticateJWTOptional, sendSummary);
postsRouter.post('/posts/:id/summary', authenticateJWTOptional, sendSummary);

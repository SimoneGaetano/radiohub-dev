import { Router } from 'express';
import { z } from 'zod';
import { searchRadios } from '../services/radioService';
import { UpstreamError, UpstreamTimeoutError } from '../services/radioSource';
import { errorContext, logger } from '../utils/logger';

/**
 * Query-string validation for `GET /api/radios`.
 * - `q`: optional station name (trimmed, empty → undefined)
 * - `limit`: default 20, max 50
 * - `page`: default 1
 */
const radiosQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

export const radiosRouter = Router();

radiosRouter.get('/radios', async (req, res) => {
  const parsed = radiosQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { q, limit, page } = parsed.data;

  try {
    const { stations, cache } = await searchRadios({ q, limit, page });

    res.setHeader('X-Cache', cache);
    res.json({
      data: stations,
      meta: {
        query: q ?? null,
        limit,
        page,
        count: stations.length,
        source: 'radio-browser',
      },
    });
  } catch (error) {
    if (error instanceof UpstreamTimeoutError) {
      res.status(504).json({ error: 'Gateway Timeout', message: error.message });
      return;
    }

    if (error instanceof UpstreamError) {
      res.status(502).json({ error: 'Bad Gateway', message: error.message });
      return;
    }

    logger.error('Unexpected error while searching radios', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

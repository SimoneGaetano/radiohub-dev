import { Router } from 'express';
import { z } from 'zod';
import { getStationsByIds, searchRadios } from '../services/radioService';
import { UpstreamError, UpstreamTimeoutError } from '../services/radioSource';
import { buildFallbackBio, createAiService } from '../services/aiService';
import { errorContext, logger } from '../utils/logger';

/**
 * Query-string validation for `GET /api/radios`.
 * - `query` / `q`: optional station name (the brief names it `query`, the
 *   frontend sends `q`; both are accepted, trimmed, empty → undefined)
 * - `limit`: default 20, max 50
 * - `page`: default 1
 * - `tag`: candidate genre tags (comma separated, lowercase, max 5) forwarded
 *   as `tagList`; the backend tries them **in order** until one has results
 * - `countryCode`: ISO country filter (e.g. `IT`) for "Top Italia"
 * - `bitrateMin`: minimum bitrate, for the "HD" filter
 * - `order`: upstream ordering (`votes` for the pills)
 */
/** Free-text search term: trimmed, empty → `undefined`. */
const searchTermSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const radiosQuerySchema = z.object({
  /** Term as named in the brief (B1): `GET /api/radios?query=<testo>`. */
  query: searchTermSchema,
  /** Same value as sent by the frontend; it wins when both are present. */
  q: searchTermSchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
  tag: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) =>
      value && value.length > 0
        ? value
            .split(',')
            .map((tag) => tag.trim().toLowerCase().slice(0, 32))
            .filter((tag) => tag.length > 0)
            .slice(0, 5)
        : undefined,
    )
    .refine((tags) => tags === undefined || tags.length > 0, {
      message: 'Provide at least one non-empty tag',
    }),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .optional()
    .transform((value) => value?.toUpperCase()),
  bitrateMin: z.coerce.number().int().min(1).max(10000).optional(),
  order: z.enum(['votes', 'name', 'clickcount', 'bitrate']).optional(),
}).transform(({ query, ...rest }) => ({ ...rest, q: rest.q ?? query }));

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

  const { q, limit, page, tag, countryCode, bitrateMin, order } = parsed.data;

  try {
    const { stations, cache, provider, fallback } = await searchRadios({
      q,
      limit,
      page,
      tags: tag,
      countryCode,
      bitrateMin,
      order,
    });

    res.setHeader('X-Cache', cache);
    // Osservabile anche dagli header: chi ha risposto davvero alla ricerca (B1).
    res.setHeader('X-Radio-Source', provider);
    res.json({
      data: stations,
      meta: {
        query: q ?? null,
        limit,
        page,
        count: stations.length,
        source: provider,
        // Valorizzato quando la ricerca non è passata da FM-World: dice chi ha
        // risposto al suo posto e perché, invece di nascondere il fallback.
        fallback,
        filters: {
          tags: tag ?? null,
          countryCode: countryCode ?? null,
          bitrateMin: bitrateMin ?? null,
          order: order ?? null,
        },
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

/**
 * Validation for `GET /api/radios/by-ids?ids=a,b,c`: 1 to 50 ids, used to
 * render the favourites/recents stored server-side (B4) on any device.
 */
const byIdsQuerySchema = z.object({
  ids: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    )
    .refine((ids) => ids.length >= 1 && ids.length <= 50, {
      message: 'Provide between 1 and 50 station ids',
    }),
});

/** Resolves stations by id, proxying the upstream source (with Redis cache). */
radiosRouter.get('/radios/by-ids', async (req, res) => {
  const parsed = byIdsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const { stations, cache } = await getStationsByIds(parsed.data.ids);

    res.setHeader('X-Cache', cache);
    res.json({
      data: stations,
      meta: {
        count: stations.length,
        requested: parsed.data.ids.length,
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

    logger.error('Unexpected error while resolving radios by id', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/ai/radio-info — generates a detailed bio for a radio given its
 * ID, name and (optionally) country/tags. Uses the AI provider when a valid
 * API key is configured (Gemini first, then OpenAI); on missing key or
 * provider failure it falls back to a dynamic sentence built from the station
 * name and country. Never throws.
 */

/** Validation for POST /api/ai/radio-info. */
const radioInfoSchema = z.object({
  radioId: z.string().trim().min(1).max(128),
  radioName: z.string().trim().min(1).max(128),
  country: z.string().trim().max(128).optional(),
  tags: z.array(z.string().trim().max(64)).max(50).optional(),
});

/** AI-powered generator of radio bios (dynamic fallback on failure). */
const aiService = createAiService();

radiosRouter.post('/ai/radio-info', async (req, res) => {
  const parsed = radioInfoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { radioId, radioName, country, tags } = parsed.data;

  try {
    const bio =
      (await aiService.generateRadioInfo(radioId, radioName, { country, tags })) ??
      buildFallbackBio(radioName, country);
    res.json({ data: { radioId, radioName, bio } });
  } catch (error) {
    logger.error('AI radio-info generation failed', errorContext(error));
    // Fallback on any unexpected error: dynamic sentence from name + country.
    res.json({ data: { radioId, radioName, bio: buildFallbackBio(radioName, country) } });
  }
});

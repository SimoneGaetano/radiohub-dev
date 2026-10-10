import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { publishPostEvent } from '../realtime/postEvents';
import { errorContext, logger } from '../utils/logger';
import { invalidatePostsCache } from './postsCache';

/** Shape of one item of the external news feed (WordPress REST-style JSON). */
interface FeedItem {
  id?: number;
  date?: string;
  date_gmt?: string;
  status?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
}

export interface NewsSyncResult {
  /** Items received from the feed. */
  fetched: number;
  created: number;
  updated: number;
  /** Items without a usable id/title (or failing to persist). */
  skipped: number;
}

/** Feed download timeout; a slow feed must never hang the sync. */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Adds a throwaway query parameter to the feed URL.
 *
 * **Why it is needed (measured, not theoretical).** The feed sits behind a CDN
 * edge that kept answering with the same snapshot for ~12 hours
 * (`x-cache: Hit from cloudfront`, `age: 42558`) even though the origin marks it
 * `no-store, private, max-age=0`. Sending `cache-control: no-cache` or
 * `cache: 'no-store'` on the request changed nothing: only a **different URL**
 * turned the response into a Miss and returned the fresh feed. Without this the
 * periodic job would happily re-import the same articles forever
 * (`fetched: 10, created: 0` on every run).
 */
export function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_cb=${Date.now()}`;
}

/** Guards against overlapping runs (interval + manual /api/sync). */
let syncInFlight = false;

export function isNewsSyncRunning(): boolean {
  return syncInFlight;
}

export class NewsSyncInProgressError extends Error {
  constructor() {
    super('A news sync is already in progress');
    this.name = 'NewsSyncInProgressError';
  }
}

/** Decodes numeric and common named HTML entities (feed titles use them). */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => named[name] ?? match);
}

/** Converts feed HTML into plain, display-ready text. */
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withBreaks)
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Prefers the GMT date (parsed as UTC), then local date, then "now". */
function toPublishedAt(item: FeedItem): Date {
  const gmt = item.date_gmt;
  if (gmt) {
    const iso = /[Zz]|[+-]\d\d:\d\d$/.test(gmt) ? gmt : `${gmt}Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (item.date) {
    const parsed = new Date(item.date);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** Prisma unique-constraint violation (P2002) — race between two syncs. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** Normalised post shape ready to be persisted (see `Post` in schema.prisma). */
export interface NormalizedFeedItem {
  /** Feed `id` as string — the dedup key (`Post.externalId` is unique). */
  externalId: string;
  title: string;
  content: string;
  publishedAt: Date;
}

/**
 * Maps one raw feed element to a `Post` payload, or `null` when the element is
 * not publishable (not an object, no numeric `id`, empty title or a `status`
 * other than "publish"). Exported so the mapping logic can be unit-tested
 * without hitting the network or the database.
 */
export function mapFeedItem(raw: unknown): NormalizedFeedItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as FeedItem;

  const externalId =
    typeof item.id === 'number' && Number.isFinite(item.id)
      ? String(item.id)
      : undefined;
  const title = item.title?.rendered ? htmlToText(item.title.rendered) : '';
  if (!externalId || !title) return null;
  if (item.status !== undefined && item.status !== 'publish') return null;

  return {
    externalId,
    title,
    content: htmlToText(item.content?.rendered ?? ''),
    publishedAt: toPublishedAt(item),
  };
}

/**
 * B2 ingestion: downloads the external news feed, normalises every item
 * (HTML → plain text) and upserts it into the `Post` table keyed by
 * `externalId` (= feed `id`), so re-running the sync never duplicates rows.
 * An existing `summary` is never overwritten. On success the Redis cache of
 * `GET /api/posts` is invalidated. Throws on feed/network/parse errors.
 */
export async function syncNews(): Promise<NewsSyncResult> {
  if (syncInFlight) throw new NewsSyncInProgressError();
  syncInFlight = true;
  try {
    const response = await fetch(withCacheBuster(env.NEWS_FEED_URL), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`News feed responded with HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('News feed payload is not an array');
    }

    const result: NewsSyncResult = {
      fetched: payload.length,
      created: 0,
      updated: 0,
      skipped: 0,
    };

    for (const raw of payload) {
      const item = mapFeedItem(raw);
      if (!item) {
        result.skipped += 1;
        continue;
      }

      const { externalId, ...data } = item;

      try {
        const existing = await prisma.post.findUnique({
          where: { externalId },
          select: { id: true, title: true, content: true },
        });
        if (existing) {
          // A stored summary stays valid as long as the article text is the
          // same. When the feed actually rewrites it, the summary is dropped so
          // it gets regenerated on demand instead of describing stale content.
          const edited =
            existing.title !== data.title || existing.content !== data.content;
          if (edited) {
            // Per-user summaries of a rewritten article are stale as well.
            await prisma.postSummary.deleteMany({
              where: { postId: existing.id },
            });
          }
          await prisma.post.update({
            where: { externalId },
            data: edited ? { ...data, summary: null } : data,
          });
          result.updated += 1;
        } else {
          await prisma.post.create({ data: { externalId, ...data } });
          result.created += 1;
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Concurrent sync created the row first → converge to an update.
          try {
            await prisma.post.update({ where: { externalId }, data });
            result.updated += 1;
            continue;
          } catch (updateError) {
            logger.warn('News sync failed to update post', {
              externalId,
              ...errorContext(updateError),
            });
            result.skipped += 1;
            continue;
          }
        }
        logger.warn('News sync failed to persist post', {
          externalId,
          ...errorContext(error),
        });
        result.skipped += 1;
      }
    }

    await invalidatePostsCache();
    if (result.created > 0 || result.updated > 0) {
      // X5: chi è collegato al flusso lo scopre adesso, non al prossimo giro di
      // polling. L'evento passa da Redis pub/sub perché il backend può girare su
      // più istanze: chi ha il client SSE può non essere l'istanza che ha
      // sincronizzato.
      await publishPostEvent({
        created: result.created,
        updated: result.updated,
        at: new Date().toISOString(),
      });
    }
    logger.info('News sync completed', { ...result });
    return result;
  } finally {
    syncInFlight = false;
  }
}

/**
 * Fire-and-forget wrapper for the periodic job: overlapping runs are skipped
 * quietly and every failure is logged instead of crashing the process.
 */
export async function runNewsSyncSafely(): Promise<void> {
  if (syncInFlight) {
    logger.warn('News sync skipped: previous run still in progress');
    return;
  }
  try {
    await syncNews();
  } catch (error) {
    logger.error('News sync failed', errorContext(error));
  }
}

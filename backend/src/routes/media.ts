import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { Router } from 'express';
import { z } from 'zod';
import { errorContext, logger } from '../utils/logger';

/**
 * Same-origin image proxy used only for **colour extraction** of station
 * artwork: reading a canvas pixel requires CORS, and many radio hosts do not
 * send the header, so the dominant-colour tint used to fall back to a neutral
 * gradient for those stations. Serving the image from our own origin removes
 * the CORS requirement entirely.
 *
 * Hard limits and SSRF guards: this is not a general-purpose proxy.
 */
const FETCH_TIMEOUT_MS = 6_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Artwork rarely changes: the browser caches it for a day. */
const CACHE_SECONDS = 86_400;

const mediaQuerySchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

export const mediaRouter = Router();

/** `true` for loopback / private / link-local / multicast addresses. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (version === 6) {
    const value = address.toLowerCase();
    return (
      value === '::1' ||
      value === '::' ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe80') ||
      value.startsWith('::ffff:127.') ||
      value.startsWith('::ffff:10.') ||
      value.startsWith('::ffff:192.168.')
    );
  }

  return false;
}

/**
 * Parses the target URL and refuses anything that is not a public http(s)
 * resource. The DNS check runs before the fetch; a rebinding between the two
 * (same hostname resolving to a private IP later) is a documented residual
 * risk of a hostname-based check.
 */
async function resolvePublicUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return null;
  }

  try {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length === 0) {
      return null;
    }
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      return null;
    }
  } catch {
    return null;
  }

  return url;
}

/**
 * GET /api/media?url=… — streams station artwork from a public host so the
 * browser can read its pixels without CORS restrictions.
 */
mediaRouter.get('/media', async (req, res) => {
  const parsed = mediaQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const firstTarget = await resolvePublicUrl(parsed.data.url);
  if (!firstTarget) {
    res.status(400).json({ error: 'Invalid or non-public image url' });
    return;
  }

  let target: URL = firstTarget;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(target, {
        redirect: 'manual',
        headers: { Accept: 'image/*', 'User-Agent': 'RadioHub/0.1.0' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        const next = location
          ? await resolvePublicUrl(new URL(location, target).toString())
          : null;
        if (!next) {
          res.status(502).json({ error: 'Invalid redirect target' });
          return;
        }
        target = next;
        continue;
      }

      if (!response.ok) {
        res.status(502).json({
          error: `Upstream image responded with status ${response.status}`,
        });
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        res.status(415).json({ error: 'Upstream resource is not an image' });
        return;
      }

      const declared = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(declared) && declared > MAX_BYTES) {
        res.status(413).json({ error: 'Image too large' });
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0) {
        res.status(502).json({ error: 'Empty image' });
        return;
      }
      if (buffer.byteLength > MAX_BYTES) {
        res.status(413).json({ error: 'Image too large' });
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
      res.send(buffer);
      return;
    }

    res.status(502).json({ error: 'Too many redirects' });
  } catch (error) {
    const name =
      typeof error === 'object' && error !== null && 'name' in error
        ? String((error as { name?: unknown }).name)
        : '';
    if (name === 'TimeoutError') {
      res.status(504).json({ error: 'Gateway Timeout' });
      return;
    }
    logger.warn('Image proxy failed', {
      url: target.toString(),
      ...errorContext(error),
    });
    res.status(502).json({ error: 'Bad Gateway' });
  }
});

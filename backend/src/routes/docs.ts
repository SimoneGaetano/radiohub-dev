import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import helmet from 'helmet';
import { openApiDocument } from '../docs/openapi';
import { errorContext, logger } from '../utils/logger';

export const docsRouter = Router();

/**
 * RapiDoc bundle **vendored** in `public/` (MIT licence, kept in the header of
 * the file). Serving it from our own origin means the reference page works on a
 * machine with no internet access, which is the same promise as
 * `docker compose up` on a host with only Docker (D1).
 */
const RAPIDOC_BUNDLE_PATH = path.join(
  process.cwd(),
  'public',
  'rapidoc-min.js',
);

/** Read once, then served from memory (the file is ~850 KB). */
let rapidocBundle: Buffer | null = null;

/**
 * RapiDoc builds its UI inside a shadow root and injects inline styles, so the
 * global helmet policy would block it. This variant keeps every request
 * same-origin and relaxes only what the component needs; `upgrade-insecure-requests`
 * is intentionally absent because it would break the page on `http://localhost`.
 */
const docsContentSecurityPolicy = helmet({
  contentSecurityPolicy: {
    // `useDefaults: false`: la policy è esattamente quella scritta qui. Con i
    // default di helmet verrebbero aggiunte direttive non volute, fra cui
    // `upgrade-insecure-requests`, che romperebbe la pagina su http://localhost.
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'font-src': ["'self'", 'data:', 'https:'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'"],
    },
  },
});

/** The OpenAPI 3.1 document (B5) — also the source of the RapiDoc page. */
docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

/** RapiDoc bundle, same-origin: no CDN, no third-party request. */
docsRouter.get('/docs/rapidoc-min.js', (_req, res) => {
  if (!rapidocBundle) {
    try {
      rapidocBundle = readFileSync(RAPIDOC_BUNDLE_PATH);
    } catch (error) {
      logger.error('RapiDoc bundle not found', {
        path: RAPIDOC_BUNDLE_PATH,
        ...errorContext(error),
      });
      res.status(500).json({ error: 'RapiDoc bundle not available' });
      return;
    }
  }

  res.type('text/javascript').send(rapidocBundle);
});

/** Interactive API reference (B5): `GET /api/docs`. */
docsRouter.get('/docs', docsContentSecurityPolicy, (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RadioHub API — documentazione</title>
    <script type="module" src="/api/docs/rapidoc-min.js"></script>
  </head>
  <body style="margin: 0">
    <!--
      RapiDoc 9.x registers the custom element as <rapi-doc> (the legacy
      <rapidoc> name is NOT defined by the bundle: using it silently produces a
      blank page). tests/docs.test.ts compares this tag against the
      customElements.define() calls found in the served bundle, so the mistake
      cannot come back unnoticed.
    -->
    <rapi-doc
      spec-url="/api/openapi.json"
      theme="dark"
      primary-color="#10b981"
      font-size="large"
      schema-style="table"
      schema-description-expanded
      render-style="read"
      show-header
      show-info
    ></rapi-doc>
    <p style="font-family: system-ui; padding: 1rem">
      Se la pagina non si carica, la specifica resta disponibile in JSON su
      <a href="/api/openapi.json">/api/openapi.json</a>.
    </p>
  </body>
</html>
`);
});

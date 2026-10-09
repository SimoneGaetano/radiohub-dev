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
  <body style="margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden">
    <!--
      RapiDoc 9.x registers the custom element as <rapi-doc> (the legacy
      <rapidoc> name is NOT defined by the bundle: using it silently produces a
      blank page). tests/docs.test.ts compares this tag against the
      customElements.define() calls found in the served bundle, so the mistake
      cannot come back unnoticed.
    -->
    <!--
      L'altezza del componente è OBBLIGATORIA (flex: 1 + min-height: 0).
      Senza di essa il contenitore interno di RapiDoc (main.main-content) non ha
      un limite e cresce quanto tutto il documento: il suo genitore ha
      overflow: hidden, che per specifica CSS INTERROMPE la catena dello scroll.
      La rotellina del mouse quindi non scorre più la pagina, mentre scrollTo, lo
      scrollIntoView dei link della barra laterale e la barra di scorrimento
      continuano a funzionare: il difetto sembra "a intermittenza" e la pagina
      sembra rotta solo a tratti. Con il componente limitato in altezza, RapiDoc
      crea il proprio contenitore scrollabile interno e la rotellina torna a
      funzionare. Verificato con eventi wheel reali via DevTools Protocol.
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
      style="flex: 1 1 auto; min-height: 0; width: 100%"
    ></rapi-doc>
    <p
      style="flex: 0 0 auto; margin: 0; padding: 0.5rem 1rem; border-top: 1px solid #334155; font-family: system-ui; font-size: 0.8rem; color: #94a3b8"
    >
      Se la pagina non si carica, la specifica resta disponibile in JSON su
      <a href="/api/openapi.json" style="color: #34d399">/api/openapi.json</a>.
    </p>
  </body>
</html>
`);
});

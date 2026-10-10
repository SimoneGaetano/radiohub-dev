import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma } from '../src/db/prisma';
import { closeRedis } from '../src/redis/client';

const app = createApp();

afterAll(async () => {
  await disconnectPrisma();
  await closeRedis();
});

/** Only the parts of the document these tests inspect. */
interface SpecShape {
  openapi: string;
  info: { title: string; version: string };
  security?: unknown[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    responses: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
}

/** One operation as it appears in the document. */
interface OperationShape {
  operationId?: string;
  security?: unknown[];
  responses?: Record<string, unknown>;
}

/**
 * Every endpoint the application really exposes (B5). Keeping the list here
 * makes the test fail when a route is added without documenting it.
 */
const DOCUMENTED_OPERATIONS: ReadonlyArray<[string, string]> = [
  ['/', 'get'],
  ['/api/health', 'get'],
  ['/api/health/ready', 'get'],
  ['/api/radios', 'get'],
  ['/api/radios/search', 'post'],
  ['/api/radios/by-ids', 'get'],
  ['/api/media', 'get'],
  ['/api/posts', 'get'],
  ['/api/posts/stream', 'get'],
  ['/api/posts/ask', 'post'],
  ['/api/posts/{id}/summary', 'get'],
  ['/api/posts/{id}/summary', 'post'],
  ['/api/auth/register', 'post'],
  ['/api/auth/login', 'post'],
  ['/api/auth/refresh', 'post'],
  ['/api/auth/logout', 'post'],
  ['/api/favorites', 'get'],
  ['/api/favorites', 'post'],
  ['/api/favorites/{radioId}', 'delete'],
  ['/api/recents', 'get'],
  ['/api/recents', 'post'],
  ['/api/recents', 'delete'],
  ['/api/sync', 'post'],
  ['/api/ai/radio-info', 'post'],
];

describe('GET /api/openapi.json (B5)', () => {
  it('serve un documento OpenAPI 3.1 con le info dell’API', async () => {
    const response = await request(app).get('/api/openapi.json');

    expect(response.status).toBe(200);
    const spec = response.body as SpecShape;
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('RadioHub API');
    expect(spec.info.version).toBe('0.1.0');
  });

  it('documenta tutti gli endpoint esposti dall’applicazione', async () => {
    const response = await request(app).get('/api/openapi.json');
    const spec = response.body as SpecShape;

    const missing = DOCUMENTED_OPERATIONS.filter(
      ([path, method]) => spec.paths[path]?.[method] === undefined,
    ).map(([path, method]) => `${method.toUpperCase()} ${path}`);

    expect(missing).toEqual([]);
    expect(Object.keys(spec.paths)).toHaveLength(
      new Set(DOCUMENTED_OPERATIONS.map(([path]) => path)).size,
    );
  });

  it('dichiara i due schemi di autenticazione usati dalle rotte', async () => {
    const response = await request(app).get('/api/openapi.json');
    const spec = response.body as SpecShape;

    expect(Object.keys(spec.components.securitySchemes).sort()).toEqual([
      'bearerAuth',
      'syncKey',
    ]);
  });

  it('non lascia $ref rotti: ogni riferimento esiste nei componenti', async () => {
    const response = await request(app).get('/api/openapi.json');
    const spec = response.body as SpecShape;
    const refs = [
      ...JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/([^"]+)"/g),
    ].map((match) => match[1] ?? '');

    expect(refs.length).toBeGreaterThan(10);
    const groups = spec.components as unknown as Record<
      string,
      Record<string, unknown>
    >;
    for (const ref of refs) {
      const [group, name] = ref.split('/');
      expect(
        group !== undefined && name !== undefined
          ? groups[group]?.[name]
          : undefined,
      ).toBeDefined();
    }
  });

  /**
   * Quality gate taken from `redocly lint` (the rules that were failing):
   * every operation needs an `operationId` and an explicit security context
   * (root `security: []` = public, overridden where a token is required).
   */
  it('ha operationId unici e un contesto di sicurezza per ogni operation', async () => {
    const response = await request(app).get('/api/openapi.json');
    const spec = response.body as SpecShape;

    expect(spec.security).toEqual([]);

    const problems: string[] = [];
    const seen = new Set<string>();
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, raw] of Object.entries(item)) {
        const operation = raw as OperationShape;
        if (!operation.operationId) {
          problems.push(
            `${method.toUpperCase()} ${path}: operationId mancante`,
          );
          continue;
        }
        if (seen.has(operation.operationId)) {
          problems.push(`${operation.operationId}: operationId duplicato`);
        }
        seen.add(operation.operationId);
        if (Object.keys(operation.responses ?? {}).length === 0) {
          problems.push(`${method.toUpperCase()} ${path}: nessuna risposta`);
        }
      }
    }

    expect(problems).toEqual([]);
    expect(seen.size).toBe(DOCUMENTED_OPERATIONS.length);
  });
});

describe('GET /api/docs (B5)', () => {
  it('serve la pagina RapiDoc puntata alla specifica', async () => {
    const response = await request(app).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('<rapi-doc');
    expect(response.text).toContain('spec-url="/api/openapi.json"');
    expect(response.text).toContain('/api/docs/rapidoc-min.js');
  });

  /**
   * Regression test for a real bug: the page originally used `<rapidoc>`, but
   * the RapiDoc 9.x bundle only defines `<rapi-doc>` — the page rendered blank
   * with no error anywhere. The tag is therefore compared against the
   * `customElements.define()` calls **found in the served bundle**, not against
   * a hard-coded string.
   */
  it('usa l’elemento custom che il bundle registra davvero', async () => {
    const [page, bundle] = await Promise.all([
      request(app).get('/api/docs'),
      request(app).get('/api/docs/rapidoc-min.js'),
    ]);

    const defined = [
      ...bundle.text.matchAll(
        /customElements\.define\(\s*["'`]([a-z0-9-]+)["'`]/gi,
      ),
    ].map((match) => match[1] ?? '');
    const tag = page.text.match(/<([a-z0-9-]+)[\s>][^>]*spec-url=/i)?.[1] ?? '';

    expect(defined.length).toBeGreaterThan(5);
    expect(tag).not.toBe('');
    expect(defined).toContain(tag);
  });

  /**
   * RapiDoc renders inside a shadow root and injects inline styles: the global
   * helmet policy would block it. The page ships its own policy instead — and
   * must NOT include `upgrade-insecure-requests`, which would break the page on
   * plain http://localhost.
   */
  it('applica una CSP che consente a RapiDoc di renderizzare', async () => {
    const response = await request(app).get('/api/docs');

    const csp = response.headers['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('serve il bundle RapiDoc dalla stessa origine (nessuna CDN)', async () => {
    const response = await request(app).get('/api/docs/rapidoc-min.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    // Il bundle reale pesa ~850 KB: un file mancante o vuoto deve fallire qui.
    expect(response.text.length).toBeGreaterThan(100_000);
    expect(response.text).toContain('rapidoc');
  });
});

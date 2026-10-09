import 'dotenv/config';
import { z } from 'zod';

/**
 * Schema describing every environment variable the backend needs.
 * The app fails fast at startup if the configuration is invalid.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // PostgreSQL
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Radio source (upstream API)
  RADIO_API_BASE_URL: z
    .string()
    .url()
    .default('https://de1.api.radio-browser.info'),
  RADIO_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  RADIO_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  RADIO_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  // Auth (JWT)
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  // AI (OpenAI / Gemini) — optional; enables the real provider when set.
  OPENAI_API_KEY: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  /** Summary provider (A2): `auto` picks the first configured API key. */
  SUMMARY_PROVIDER: z
    .enum(['auto', 'gemini', 'openai', 'mock'])
    .default('auto'),
  /** Model used by the summary provider; empty = provider default (A2/D2). */
  SUMMARY_MODEL: z.string().trim().optional(),
  /** Longest article excerpt sent to the model — longer posts are truncated (A3). */
  SUMMARY_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(6000),

  // News feed (external source for /api/posts, read periodically per B2).
  NEWS_FEED_URL: z
    .string()
    .url()
    .default('https://d3r6kmd22dkoyn.cloudfront.net/'),
  NEWS_SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Shared secret required by POST /api/sync; when unset the route is disabled. */
  SYNC_API_KEY: z.string().trim().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Invalid environment configuration:',
    parsed.error.flatten().fieldErrors,
  );
  throw new Error('Invalid environment configuration');
}

export const env: Env = parsed.data;

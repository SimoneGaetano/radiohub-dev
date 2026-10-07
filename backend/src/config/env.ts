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

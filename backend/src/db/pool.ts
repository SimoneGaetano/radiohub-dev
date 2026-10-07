import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * Shared PostgreSQL connection pool used across the application.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error: Error) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle PostgreSQL client', error);
});

/**
 * Lightweight readiness probe: returns `true` when the database answers.
 */
export async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully closes the pool (used on shutdown).
 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
}

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';

/**
 * Prisma 7 uses a driver adapter (no Rust engine). The pg adapter reuses the
 * connection-pooled `pg` driver.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/**
 * Reuse a single PrismaClient across hot-reloads (dev) to avoid exhausting
 * the database connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Readiness probe: verifies the database connection through Prisma's raw
 * query interface (`$queryRaw`).
 */
export async function checkPrisma(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully disconnects Prisma (used on shutdown).
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

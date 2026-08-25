import { PrismaClient } from '@prisma/client';

/**
 * Next.js dev-mode hot reload re-evaluates modules, which would otherwise open
 * a new pool on every save until the database refuses connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** True when a database is actually configured. */
export const databaseConfigured = (): boolean =>
  Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

import { databaseConfigured, prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness for the platform's health check.
 *
 * Deliberately returns 200 when the database is unreachable but the process is
 * serving. A health check that fails on a database blip would have the platform
 * restart a perfectly healthy container — turning a recoverable dependency
 * outage into a restart loop. The database state is reported in the body, and
 * /api/diagnostics is where you go to act on it.
 */
export async function GET() {
  let database: 'ok' | 'unreachable' | 'unconfigured' = 'unconfigured';

  if (databaseConfigured()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      database = 'unreachable';
    }
  }

  return Response.json(
    { ok: true, database, uptimeSeconds: Math.round(process.uptime()) },
    { headers: { 'cache-control': 'no-store' } },
  );
}

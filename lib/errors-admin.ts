import { prisma } from './db';

export interface ErrorRow {
  id: string;
  scope: string;
  message: string;
  stack: string | null;
  context: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

/**
 * Open faults first, most recently seen first inside that.
 *
 * Resolved rows are kept rather than deleted: "this happened, we dealt with
 * it, here is when it last recurred" is the useful shape, and a fault that
 * comes back clears its own resolution automatically.
 */
export async function listErrorsForAdmin(limit = 100): Promise<ErrorRow[]> {
  const rows = await prisma.errorEvent.findMany({
    orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { lastSeenAt: 'desc' }],
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    message: r.message,
    stack: r.stack,
    context: r.context,
    count: r.count,
    firstSeenAt: r.firstSeenAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

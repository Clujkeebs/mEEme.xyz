import { isAdmin } from '@/lib/admin';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The counts this page shows before anyone touches the button — the same
 * numbers a purge would erase, so the decision is made with the real stakes
 * in view rather than in the abstract.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  const [total, graded, correct] = await Promise.all([
    prisma.signal.count({ where: { synthetic: false } }),
    prisma.signalOutcome.count({ where: { grade: { not: 'pending' } } }),
    prisma.signalOutcome.count({ where: { grade: 'correct' } }),
  ]);

  return jsonOk({ total, graded, correct });
}

/**
 * Erase the entire public track record — every Signal and, by cascade, its
 * SignalOutcome. Deliberately not a soft delete and not scoped to "just the
 * bad ones": a selective purge that kept the flattering calls and removed
 * the losses would be strictly worse than this, and this app's own code has
 * said as much elsewhere. What this route does is a full, undifferentiated
 * reset — the entire ledger starts over from zero at the moment it runs.
 *
 * Gated behind a typed confirmation, not just the admin check, because
 * isAdmin() protects against the wrong *person* hitting this — the phrase
 * protects against the right person hitting it by accident. There is no
 * undo once this returns.
 */
const CONFIRMATION_PHRASE = 'DELETE ALL TRACK RECORD';

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== CONFIRMATION_PHRASE) {
    return jsonError(`Type "${CONFIRMATION_PHRASE}" to confirm.`, 400);
  }

  // SignalOutcome cascades from Signal (onDelete: Cascade in schema.prisma),
  // so deleting Signal rows is sufficient — no separate outcome delete needed.
  const { count } = await prisma.signal.deleteMany({});

  return jsonOk({ deleted: count });
}

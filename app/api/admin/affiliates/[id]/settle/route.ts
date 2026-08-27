import { isAdmin } from '@/lib/admin';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mark every currently-unpaid commission for one affiliate as paid out.
 *
 * "Earned" and "paid" are different questions — this app has no payment
 * rail to actually pay an affiliate, so this just records that a human did
 * it outside the system (a wire transfer, PayPal, whatever the deal used).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  const result = await prisma.affiliateCommission.updateMany({
    where: { affiliateId: params.id, paidOut: false },
    data: { paidOut: true },
  });

  return jsonOk({ settledCount: result.count });
}

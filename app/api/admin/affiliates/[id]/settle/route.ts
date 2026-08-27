import { z } from 'zod';
import { isAdmin } from '@/lib/admin';
import { settleAffiliate } from '@/lib/affiliate';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ note: z.string().max(200).nullish() });

/**
 * Record a payout covering everything currently outstanding for one affiliate.
 *
 * "Earned" and "paid" are different questions — this app has no payment rail
 * to actually pay an affiliate, so this records that a human sent the money
 * outside the system (a wire, PayPal, whatever the deal used) and stamps the
 * commissions that settlement covered.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  // A note is optional, and a body is too — don't fail the settlement over it.
  let note: string | null = null;
  try {
    const parsed = schema.safeParse(await request.json());
    if (parsed.success) note = parsed.data.note ?? null;
  } catch {
    // No body sent. Fine — settle without a note.
  }

  const result = await settleAffiliate(params.id, { note, byEmail: viewer?.email ?? null });
  if (!result.ok) return jsonError(result.error ?? 'Could not settle.', 400);

  return jsonOk({ amountUsd: result.amountUsd, commissionCount: result.commissionCount });
}

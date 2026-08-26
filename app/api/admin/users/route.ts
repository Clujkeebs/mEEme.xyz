import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api';
import { isAdmin, listUsersForAdmin } from '@/lib/admin';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TIERS } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only user directory.
 *
 * A 404 rather than a 403 for a non-admin caller — same reasoning as
 * /api/admin/promo: a 403 confirms the route exists and is worth probing.
 */

export async function GET() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  return jsonOk({ users: await listUsersForAdmin() });
}

const patchSchema = z.object({
  id: z.string().min(1),
  tier: z.enum(['FREE', 'DEGEN', 'APEX']),
});

/**
 * Comp or downgrade a user's tier directly.
 *
 * This writes the real `tier` column, not a promo trial — it is meant for
 * "this person gets Apex, full stop," not a time-boxed grant. A promo code
 * (see /admin/promo) is the right tool when the grant should expire.
 */
export async function PATCH(request: Request) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return jsonError('Invalid request.', 400);

  try {
    await prisma.user.update({ where: { id: parsed.data.id }, data: { tier: parsed.data.tier } });
  } catch {
    return jsonError('User not found.', 404);
  }
  return jsonOk({ updated: true, tierName: TIERS[parsed.data.tier].name });
}

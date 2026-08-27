import { z } from 'zod';
import { isAdmin } from '@/lib/admin';
import { listAffiliatesForAdmin } from '@/lib/affiliate';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only affiliate management.
 *
 * A 404 rather than a 403 for a non-admin caller — same reasoning as the
 * other /api/admin/* routes: a 403 confirms the route exists.
 */

export async function GET() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  return jsonOk(await listAffiliatesForAdmin());
}

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'At least 3 characters.')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only.'),
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(100).nullish(),
  commissionPct: z.number().min(1).max(100),
  note: z.string().max(500).nullish(),
});

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid affiliate.', 400, { issues: parsed.error.issues });
  }

  const code = parsed.data.code.toUpperCase();

  try {
    const created = await prisma.affiliate.create({
      data: {
        code,
        email: parsed.data.email,
        name: parsed.data.name || null,
        commissionPct: parsed.data.commissionPct,
        note: parsed.data.note || null,
      },
    });
    return jsonOk({ id: created.id, code: created.code }, { status: 201 });
  } catch {
    return jsonError(`"${code}" or that email is already in use.`, 409);
  }
}

const patchSchema = z.object({ id: z.string().min(1), active: z.boolean() });

/** Disable or re-enable an affiliate. Never delete — their referral and
 * commission history is the accounting record of what they're owed. */
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
    await prisma.affiliate.update({ where: { id: parsed.data.id }, data: { active: parsed.data.active } });
  } catch {
    return jsonError('Affiliate not found.', 404);
  }
  return jsonOk({ updated: true });
}

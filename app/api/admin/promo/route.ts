import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only promo code management.
 *
 * A 404 rather than a 403 for a non-admin caller: a 403 confirms this route
 * exists and is worth probing, a 404 does not.
 */

export async function GET() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return jsonError('Not found.', 404);

  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { redemptions: true } } },
  });

  return jsonOk({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      trialTier: c.trialTier,
      trialDays: c.trialDays,
      maxRedemptions: c.maxRedemptions,
      active: c.active,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      note: c.note,
      createdByEmail: c.createdByEmail,
      createdAt: c.createdAt.toISOString(),
      redemptionCount: c._count.redemptions,
    })),
  });
}

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'At least 3 characters.')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only.'),
  trialTier: z.enum(['DEGEN', 'APEX']),
  trialDays: z.number().int().min(1).max(365),
  maxRedemptions: z.number().int().min(1).nullish(),
  expiresAt: z.string().datetime().nullish(),
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
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid promo code.', 400, {
      issues: parsed.error.issues,
    });
  }

  const code = parsed.data.code.toUpperCase();

  try {
    const created = await prisma.promoCode.create({
      data: {
        code,
        trialTier: parsed.data.trialTier,
        trialDays: parsed.data.trialDays,
        maxRedemptions: parsed.data.maxRedemptions ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        note: parsed.data.note ?? null,
        createdByEmail: viewer?.email ?? null,
      },
    });
    return jsonOk({ id: created.id, code: created.code }, { status: 201 });
  } catch {
    return jsonError(`"${code}" already exists.`, 409);
  }
}

const patchSchema = z.object({ id: z.string().min(1), active: z.boolean() });

/** Disable or re-enable a code. Never delete — a code's redemption history is
 * the accounting record of what it cost, and deleting the code would cascade
 * that away. */
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
    await prisma.promoCode.update({ where: { id: parsed.data.id }, data: { active: parsed.data.active } });
  } catch {
    return jsonError('Code not found.', 404);
  }
  return jsonOk({ updated: true });
}

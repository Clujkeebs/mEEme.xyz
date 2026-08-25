import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isPlausibleSolanaAddress } from '@/lib/providers';
import { TIERS } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  positions: z
    .array(
      z.object({
        tokenAddress: z.string().min(32).max(64),
        symbol: z.string().min(1).max(32),
        size: z.number().positive().finite(),
        entryPriceUsd: z.number().positive().finite(),
      }),
    )
    .min(1)
    .max(50),
});

/** Track several positions at once — what a wallet scan produces. */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return jsonError('Invalid positions.', 400, { issues: parsed.error.issues });

  const limit = TIERS[viewer.tier].positionSlots;
  const existing = await prisma.position.findMany({
    where: { userId: viewer.id, closedAt: null },
    select: { tokenAddress: true },
  });
  const alreadyTracked = new Set(existing.map((p) => p.tokenAddress));

  const candidates = parsed.data.positions.filter(
    (p) => isPlausibleSolanaAddress(p.tokenAddress) && !alreadyTracked.has(p.tokenAddress.trim()),
  );

  const room = Math.max(0, limit - existing.length);
  const toCreate = candidates.slice(0, room);

  if (toCreate.length > 0) {
    await prisma.position.createMany({
      data: toCreate.map((p) => ({
        userId: viewer.id,
        tokenAddress: p.tokenAddress.trim(),
        symbol: p.symbol.trim().toUpperCase().slice(0, 32),
        size: p.size,
        entryPriceUsd: p.entryPriceUsd,
      })),
    });
  }

  return jsonOk({
    created: toCreate.length,
    skippedAlreadyTracked: parsed.data.positions.length - candidates.length,
    // Say plainly when the tier is what stopped us, rather than silently
    // importing a subset and letting the count look like a bug.
    skippedNoRoom: Math.max(0, candidates.length - toCreate.length),
    limit,
  });
}

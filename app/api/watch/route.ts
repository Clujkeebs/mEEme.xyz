import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isPlausibleSolanaAddress } from '@/lib/providers';
import { TIERS } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  tokenAddress: z.string().min(32).max(64),
  symbol: z.string().min(1).max(32),
  coilThreshold: z.number().min(0).max(1).nullish(),
});

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);
  const watches = await prisma.watch.findMany({
    where: { userId: viewer.id, active: true },
    orderBy: { createdAt: 'desc' },
  });
  return jsonOk({ watches });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return jsonError('Invalid watch.', 400);
  const tokenAddress = parsed.data.tokenAddress.trim();
  if (!isPlausibleSolanaAddress(tokenAddress)) {
    return jsonError('That does not look like a Solana mint address.', 400);
  }

  const limit = TIERS[viewer.tier].watchSlots;
  const active = await prisma.watch.count({ where: { userId: viewer.id, active: true } });
  const existing = await prisma.watch.findUnique({
    where: { userId_tokenAddress: { userId: viewer.id, tokenAddress } },
  });

  // Re-activating something already on the list must not count against the cap.
  if (!existing && active >= limit) {
    return jsonError(
      `${TIERS[viewer.tier].name} watches ${limit} token${limit === 1 ? '' : 's'}. Drop one or upgrade.`,
      403,
      { upgrade: true },
    );
  }

  const watch = await prisma.watch.upsert({
    where: { userId_tokenAddress: { userId: viewer.id, tokenAddress } },
    create: {
      userId: viewer.id,
      tokenAddress,
      symbol: parsed.data.symbol.trim().toUpperCase(),
      coilThreshold: parsed.data.coilThreshold ?? 0.68,
    },
    update: {
      active: true,
      coilThreshold: parsed.data.coilThreshold ?? existing?.coilThreshold ?? 0.68,
    },
  });
  return jsonOk({ watch }, { status: 201 });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Missing id.', 400);

  // Deactivate rather than delete, so the sweep's last-seen coil survives and
  // re-adding a token does not re-fire an alert for a crossing already seen.
  const updated = await prisma.watch.updateMany({
    where: { id, userId: viewer.id },
    data: { active: false },
  });
  if (updated.count === 0) return jsonError('Watch not found.', 404);
  return jsonOk({ deactivated: updated.count });
}

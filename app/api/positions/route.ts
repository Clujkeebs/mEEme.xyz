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
  size: z.number().positive().finite(),
  entryPriceUsd: z.number().positive().finite(),
  notes: z.string().max(500).nullish(),
});

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  const positions = await prisma.position.findMany({
    where: { userId: viewer.id, closedAt: null },
    orderBy: { openedAt: 'desc' },
  });
  return jsonOk({ positions });
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
  if (!parsed.success) return jsonError('Invalid position.', 400, { issues: parsed.error.issues });
  if (!isPlausibleSolanaAddress(parsed.data.tokenAddress)) {
    return jsonError('That does not look like a Solana mint address.', 400);
  }

  const limit = TIERS[viewer.tier].positionSlots;
  const open = await prisma.position.count({ where: { userId: viewer.id, closedAt: null } });
  if (open >= limit) {
    return jsonError(
      `${TIERS[viewer.tier].name} tracks ${limit} position${limit === 1 ? '' : 's'} at a time. Close one or upgrade.`,
      403,
      { upgrade: true },
    );
  }

  const position = await prisma.position.create({
    data: {
      userId: viewer.id,
      tokenAddress: parsed.data.tokenAddress.trim(),
      symbol: parsed.data.symbol.trim().toUpperCase(),
      size: parsed.data.size,
      entryPriceUsd: parsed.data.entryPriceUsd,
      notes: parsed.data.notes ?? null,
    },
  });
  return jsonOk({ position }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  /** Closing price, when closing out. */
  exitPriceUsd: z.number().positive().finite().nullish(),
  close: z.boolean().nullish(),
  size: z.number().positive().finite().nullish(),
});

export async function PATCH(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return jsonError('Invalid update.', 400);

  // Scope the lookup to the viewer so an id from another account is a 404.
  const existing = await prisma.position.findFirst({
    where: { id: parsed.data.id, userId: viewer.id },
  });
  if (!existing) return jsonError('Position not found.', 404);

  if (parsed.data.close) {
    const exit = parsed.data.exitPriceUsd ?? existing.entryPriceUsd;
    const position = await prisma.position.update({
      where: { id: existing.id },
      data: {
        closedAt: new Date(),
        realizedPnlUsd: (exit - existing.entryPriceUsd) * existing.size,
      },
    });
    return jsonOk({ position });
  }

  const position = await prisma.position.update({
    where: { id: existing.id },
    data: { size: parsed.data.size ?? existing.size },
  });
  return jsonOk({ position });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Missing id.', 400);

  const deleted = await prisma.position.deleteMany({ where: { id, userId: viewer.id } });
  if (deleted.count === 0) return jsonError('Position not found.', 404);
  return jsonOk({ deleted: deleted.count });
}

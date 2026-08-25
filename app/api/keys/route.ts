import { z } from 'zod';
import { API_DAILY_LIMIT, issueApiKey } from '@/lib/apikey';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TIERS } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ACTIVE_KEYS = 5;

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  const keys = await prisma.apiKey.findMany({
    where: { userId: viewer.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, callsToday: true },
  });

  return jsonOk({ keys, dailyLimit: API_DAILY_LIMIT, available: TIERS[viewer.tier].apiAccess });
}

const createSchema = z.object({ name: z.string().min(1).max(60) });

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);
  if (!TIERS[viewer.tier].apiAccess) {
    return jsonError('API access is an Apex feature.', 403, { upgrade: true });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return jsonError('Give the key a name.', 400);

  const active = await prisma.apiKey.count({ where: { userId: viewer.id, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS) {
    return jsonError(`You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`, 403);
  }

  const issued = await issueApiKey(viewer.id, parsed.data.name);
  return jsonOk(
    {
      key: issued,
      // Said plainly, because there is genuinely no way to recover it later.
      warning: 'Copy this now. It is stored only as a hash and cannot be shown again.',
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Missing id.', 400);

  const revoked = await prisma.apiKey.updateMany({
    where: { id, userId: viewer.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) return jsonError('Key not found.', 404);
  return jsonOk({ revoked: revoked.count });
}

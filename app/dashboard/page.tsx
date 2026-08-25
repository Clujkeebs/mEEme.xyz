import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Watchtower } from '@/components/watchtower';
import { getViewer, googleConfigured } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQuota } from '@/lib/quota';
import { TIERS } from '@/lib/tiers';

export const metadata: Metadata = { title: 'Watchtower' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { add?: string; symbol?: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect(googleConfigured() ? '/signin' : '/lock');

  const [positions, watches, alerts, quota] = await Promise.all([
    prisma.position.findMany({
      where: { userId: viewer.id, closedAt: null },
      orderBy: { openedAt: 'desc' },
    }),
    prisma.watch.findMany({
      where: { userId: viewer.id, active: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.alert.findMany({
      where: { userId: viewer.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    getQuota(viewer.id, viewer.tier),
  ]);

  return (
    <Watchtower
      tier={viewer.tier}
      tierName={TIERS[viewer.tier].name}
      quota={{
        used: quota.used,
        limit: quota.unlimited ? null : quota.limit,
        remaining: quota.unlimited ? null : quota.remaining,
      }}
      limits={{
        positions: TIERS[viewer.tier].positionSlots,
        watches: TIERS[viewer.tier].watchSlots,
      }}
      positions={positions.map((p) => ({
        id: p.id,
        tokenAddress: p.tokenAddress,
        symbol: p.symbol,
        size: p.size,
        entryPriceUsd: p.entryPriceUsd,
        openedAt: p.openedAt.toISOString(),
      }))}
      watches={watches.map((w) => ({
        id: w.id,
        tokenAddress: w.tokenAddress,
        symbol: w.symbol,
        coilThreshold: w.coilThreshold,
        lastCoilScore: w.lastCoilScore,
        lastSweptAt: w.lastSweptAt?.toISOString() ?? null,
      }))}
      alerts={alerts.map((a) => ({
        id: a.id,
        symbol: a.symbol,
        kind: a.kind,
        message: a.message,
        priceUsd: a.priceUsd,
        createdAt: a.createdAt.toISOString(),
      }))}
      prefill={searchParams.add ? { address: searchParams.add, symbol: searchParams.symbol ?? '' } : null}
    />
  );
}

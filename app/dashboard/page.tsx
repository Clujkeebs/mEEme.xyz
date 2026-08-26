import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Watchtower } from '@/components/watchtower';
import { getViewer, googleConfigured } from '@/lib/auth';
import { emailConfigured, telegramConfigured } from '@/lib/notify';
import { heliusConfigured } from '@/lib/providers/helius';
import { prisma } from '@/lib/db';
import { getQuota } from '@/lib/quota';
import { TIERS } from '@/lib/tiers';
import { API_DAILY_LIMIT } from '@/lib/apikey';

export const metadata: Metadata = { title: 'Watchtower' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { add?: string; symbol?: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect(googleConfigured() ? '/signin' : '/lock');

  const [positions, closedPositions, watches, alerts, quota, account] = await Promise.all([
    prisma.position.findMany({
      where: { userId: viewer.id, closedAt: null },
      orderBy: { openedAt: 'desc' },
    }),
    // The close action writes realizedPnlUsd and closedAt, but until now
    // nothing ever read them back — closing a position was a one-way door
    // into the database with no way to see what you made or lost.
    prisma.position.findMany({
      where: { userId: viewer.id, closedAt: { not: null } },
      orderBy: { closedAt: 'desc' },
      take: 20,
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
    prisma.user.findUnique({
      where: { id: viewer.id },
      select: {
        email: true,
        stripeCustomerId: true,
        telegramChatId: true,
        telegramUsername: true,
        notifyTelegram: true,
        notifyEmail: true,
        quietFromHourUtc: true,
        quietToHourUtc: true,
      },
    }),
  ]);

  return (
    <Watchtower
      tier={viewer.tier}
      tierName={TIERS[viewer.tier].name}
      trialEndsAt={viewer.trialEndsAt}
      hasStripeSubscription={Boolean(account?.stripeCustomerId)}
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
      closedPositions={closedPositions.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        entryPriceUsd: p.entryPriceUsd,
        size: p.size,
        realizedPnlUsd: p.realizedPnlUsd,
        closedAt: (p.closedAt as Date).toISOString(),
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
        deliveredVia: a.deliveredVia,
      }))}
      alertPrefs={{
        telegramLinked: Boolean(account?.telegramChatId),
        telegramUsername: account?.telegramUsername ?? null,
        notifyTelegram: account?.notifyTelegram ?? true,
        notifyEmail: account?.notifyEmail ?? false,
        quietFromHourUtc: account?.quietFromHourUtc ?? null,
        quietToHourUtc: account?.quietToHourUtc ?? null,
        email: account?.email ?? null,
      }}
      telegramAvailable={telegramConfigured()}
      emailAvailable={emailConfigured()}
      walletScanAvailable={heliusConfigured()}
      apiAccess={TIERS[viewer.tier].apiAccess}
      apiDailyLimit={API_DAILY_LIMIT}
      prefill={searchParams.add ? { address: searchParams.add, symbol: searchParams.symbol ?? '' } : null}
    />
  );
}

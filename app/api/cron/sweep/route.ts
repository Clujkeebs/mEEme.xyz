import { cronAuthorized, jsonError, jsonOk } from '@/lib/api';
import { writeCachedSnapshot } from '@/lib/cache';
import { prisma } from '@/lib/db';
import { runAlphaEngine } from '@/lib/engine';
import { buildSnapshot } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The sweep — the half of the product that works while the trader is asleep.
 *
 * Walks watched tokens and open positions, re-runs the engine, and fires an
 * alert when something crosses. Alerts fire on *crossings*, not levels, so a
 * token parked above the threshold does not alert every five minutes until the
 * user hates us.
 */

/** Tokens processed per invocation, so we finish inside the function timeout. */
const BATCH_SIZE = 40;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return jsonError('Unauthorized.', 401);

  // Oldest-swept first, so nothing starves.
  const watches = await prisma.watch.findMany({
    where: { active: true },
    orderBy: [{ lastSweptAt: { sort: 'asc', nulls: 'first' } }],
    take: BATCH_SIZE,
  });

  const openPositions = await prisma.position.findMany({
    where: { closedAt: null },
    take: BATCH_SIZE,
  });

  // One token may be watched by many users — fetch it once.
  const addresses = new Set<string>([
    ...watches.map((w) => w.tokenAddress),
    ...openPositions.map((p) => p.tokenAddress),
  ]);

  const alerts: { userId: string; kind: string; message: string }[] = [];
  let swept = 0;

  for (const address of addresses) {
    const result = await buildSnapshot(address);
    // Never let synthetic data fire a real alert into someone's dashboard.
    if (result.mode === 'demo') continue;

    const snapshot = result.snapshot;
    await writeCachedSnapshot(snapshot);
    swept++;

    const marketSignal = runAlphaEngine(snapshot);

    // ── Watches: alert on threshold crossings ──────────────────────────────
    for (const watch of watches.filter((w) => w.tokenAddress === address)) {
      const previous = watch.lastCoilScore;
      const current = marketSignal.coil.coilScore;
      const crossedUp = previous !== null && previous < watch.coilThreshold && current >= watch.coilThreshold;
      // A first sweep that lands already above threshold is worth saying once.
      const firstLookAlreadyHot = previous === null && current >= watch.coilThreshold;

      if (crossedUp || firstLookAlreadyHot) {
        alerts.push({
          userId: watch.userId,
          kind: 'COIL_CROSS',
          message:
            `${snapshot.symbol} coil crossed ${watch.coilThreshold.toFixed(2)} → ${current.toFixed(2)}. ` +
            marketSignal.headline,
        });
        await prisma.alert.create({
          data: {
            userId: watch.userId,
            tokenAddress: address,
            symbol: snapshot.symbol,
            kind: 'COIL_CROSS',
            message: `Coil crossed ${watch.coilThreshold.toFixed(2)} → ${current.toFixed(2)}. ${marketSignal.headline}`,
            priceUsd: snapshot.priceUsd,
          },
        });
      }

      await prisma.watch.update({
        where: { id: watch.id },
        data: { lastCoilScore: current, lastSweptAt: new Date() },
      });
    }

    // ── Positions: alert on rungs and stops ────────────────────────────────
    for (const position of openPositions.filter((p) => p.tokenAddress === address)) {
      const signal = runAlphaEngine(snapshot, {
        size: position.size,
        entryPriceUsd: position.entryPriceUsd,
      });
      const ladder = signal.ladder;
      if (!ladder) continue;

      if (snapshot.priceUsd <= ladder.hardStopUsd) {
        await createAlertOnce(position.userId, position.id, address, snapshot.symbol, 'STOP_HIT',
          `Hard stop hit at $${snapshot.priceUsd.toPrecision(3)}. ${ladder.stopNote}`,
          snapshot.priceUsd);
        alerts.push({ userId: position.userId, kind: 'STOP_HIT', message: `${snapshot.symbol} stop hit` });
        continue;
      }

      const nextRung = ladder.rungs.find((r) => snapshot.priceUsd >= r.priceUsd);
      if (nextRung) {
        await createAlertOnce(position.userId, position.id, address, snapshot.symbol, 'RUNG_HIT',
          `${(nextRung.fraction * 100).toFixed(0)}% rung filled at $${nextRung.priceUsd.toPrecision(3)}. ${nextRung.rationale}`,
          snapshot.priceUsd);
        alerts.push({ userId: position.userId, kind: 'RUNG_HIT', message: `${snapshot.symbol} rung hit` });
      }

      if (signal.coil.insiderRealized > 0.35 && signal.coil.insiderCoil > 0.06) {
        await createAlertOnce(position.userId, position.id, address, snapshot.symbol, 'INSIDER_DUMP',
          `Insider cluster has realized ${(signal.coil.insiderRealized * 100).toFixed(0)}% of its bag. ${signal.headline}`,
          snapshot.priceUsd);
        alerts.push({ userId: position.userId, kind: 'INSIDER_DUMP', message: `${snapshot.symbol} insiders distributing` });
      }
    }
  }

  return jsonOk({ swept, tokens: addresses.size, alertsFired: alerts.length });
}

/**
 * Alerts are noise unless they are rare. Suppress a repeat of the same kind on
 * the same position inside the cooldown window.
 */
const ALERT_COOLDOWN_MS = 60 * 60_000;

async function createAlertOnce(
  userId: string,
  positionId: string,
  tokenAddress: string,
  symbol: string,
  kind: string,
  message: string,
  priceUsd: number,
): Promise<void> {
  const recent = await prisma.alert.findFirst({
    where: {
      userId,
      positionId,
      kind,
      createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) return;

  await prisma.alert.create({
    data: { userId, positionId, tokenAddress, symbol, kind, message, priceUsd },
  });
}

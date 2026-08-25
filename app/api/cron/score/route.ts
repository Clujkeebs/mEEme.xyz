import { cronAuthorized, jsonError, jsonOk } from '@/lib/api';
import { prisma } from '@/lib/db';
import type { Verdict } from '@/lib/engine/types';
import { buildSnapshot } from '@/lib/providers';
import { gradeSignal } from '@/lib/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Resolve past calls into the public track record.
 *
 * The judgement horizon is four hours after the call. Signals younger than that
 * are left pending; nothing is graded early, and nothing is graded twice.
 */

const HORIZON_MS = 4 * 60 * 60_000;
const MAX_AGE_MS = 48 * 60 * 60_000;
const BATCH_SIZE = 50;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return jsonError('Unauthorized.', 401);

  const now = Date.now();

  const due = await prisma.signal.findMany({
    where: {
      synthetic: false,
      createdAt: {
        lte: new Date(now - HORIZON_MS),
        // Past this age the price series we would need is gone; leave them.
        gte: new Date(now - MAX_AGE_MS),
      },
      outcome: null,
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });

  if (due.length === 0) return jsonOk({ graded: 0, pending: 0 });

  // Price each distinct token once, not once per signal.
  const priceByToken = new Map<string, { price: number; max: number | null; min: number | null }>();

  let graded = 0;
  let stillPending = 0;

  for (const signal of due) {
    let priced = priceByToken.get(signal.tokenAddress);

    if (!priced) {
      const result = await buildSnapshot(signal.tokenAddress);
      if (result.mode === 'demo') {
        // No live price — we cannot grade this honestly, so we do not.
        stillPending++;
        continue;
      }
      const snapshot = result.snapshot;
      // Use the candle window to recover the high and low since the call.
      const since = signal.createdAt.getTime() / 1000;
      const window = snapshot.candles.filter((c) => c.timeSec >= since);
      priced = {
        price: snapshot.priceUsd,
        max: window.length ? Math.max(...window.map((c) => c.high)) : null,
        min: window.length ? Math.min(...window.map((c) => c.low)) : null,
      };
      priceByToken.set(signal.tokenAddress, priced);
    }

    const result = gradeSignal({
      verdict: signal.verdict as Verdict,
      priceAtSignal: signal.priceAtSignal,
      priceAtHorizon: priced.price,
      maxPrice: priced.max,
      minPrice: priced.min,
    });

    await prisma.signalOutcome.create({
      data: {
        signalId: signal.id,
        price4h: priced.price,
        maxPrice24h: priced.max,
        minPrice24h: priced.min,
        grade: result.grade,
        edgePct: result.edgePct,
        resolvedAt: result.grade === 'pending' ? null : new Date(),
      },
    });

    if (result.grade === 'pending') stillPending++;
    else graded++;
  }

  return jsonOk({ graded, pending: stillPending, considered: due.length });
}

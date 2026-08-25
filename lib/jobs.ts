import { writeCachedSnapshot } from '@/lib/cache';
import { mapWithConcurrency } from '@/lib/concurrency';
import { prisma } from '@/lib/db';
import { runAlphaEngine } from '@/lib/engine';
import type { TokenSnapshot, Verdict } from '@/lib/engine/types';
import { flushPendingAlerts } from '@/lib/notify';
import { buildSnapshot } from '@/lib/providers';
import { SCAN_MIN_LIQUIDITY_USD, discoverCandidates } from '@/lib/providers/discover';
import { gradeSignal } from '@/lib/scoring';
import { TRACK_RECORD_CONFIDENCE_FLOOR, recordSignal } from '@/lib/signal-store';

/**
 * The scheduled jobs, as plain functions.
 *
 * They live here rather than inside route handlers so the HTTP endpoints and
 * the in-process scheduler run the same code. Two implementations of "sweep"
 * drifting apart is exactly the bug nobody notices until someone's stop fails
 * to fire.
 */

/* ------------------------------- sweep ---------------------------------- */

/** Tokens processed per run, so a pass finishes inside a serverless timeout. */
const SWEEP_BATCH = 40;
/** Suppress a repeat of the same alert kind on the same position inside this window. */
const ALERT_COOLDOWN_MS = 60 * 60_000;
/**
 * Snapshot fetches in flight at once. Bounded rather than sequential or
 * unbounded: sequential across dozens of tokens risks a sweep taking longer
 * than the 5-minute interval it runs on, and unbounded concurrency floods a
 * keyless-tier API (GeckoTerminal, ~30 req/min) and degrades every fetch in
 * the batch together instead of just the ones that would have hit the limit
 * anyway.
 */
const SNAPSHOT_FETCH_CONCURRENCY = 5;

export interface SweepResult {
  swept: number;
  tokens: number;
  alertsFired: number;
  delivery: { sent: number; failed: number; held: number };
}

/**
 * Re-read watched tokens and open positions, raise alerts on crossings, then
 * deliver everything outstanding.
 */
export async function runSweep(): Promise<SweepResult> {
  const watches = await prisma.watch.findMany({
    where: { active: true },
    // Oldest-swept first, so nothing starves.
    orderBy: [{ lastSweptAt: { sort: 'asc', nulls: 'first' } }],
    take: SWEEP_BATCH,
  });

  const openPositions = await prisma.position.findMany({
    where: { closedAt: null },
    take: SWEEP_BATCH,
  });

  // One token may be watched by many users — fetch it once.
  const addresses = new Set<string>([
    ...watches.map((w) => w.tokenAddress),
    ...openPositions.map((p) => p.tokenAddress),
  ]);

  // Network fetch is the slow, parallelizable part; everything after it is a
  // fast local computation plus small, independent DB writes per address, so
  // there is nothing to gain from keeping it inside the same bounded loop.
  const addressList = [...addresses];
  const results = await mapWithConcurrency(
    addressList,
    SNAPSHOT_FETCH_CONCURRENCY,
    (address) => buildSnapshot(address),
    (err, address) => {
      console.warn('[sweep] snapshot fetch failed for', address, err instanceof Error ? err.message : err);
      return null;
    },
  );

  let swept = 0;
  let alertsFired = 0;

  for (let i = 0; i < addressList.length; i++) {
    const address = addressList[i] as string;
    const result = results[i];
    // A failed fetch or synthetic fallback must never fire a real alert into
    // someone's dashboard.
    if (!result || result.mode === 'demo') continue;

    const snapshot = result.snapshot;
    await writeCachedSnapshot(snapshot);
    swept++;

    const marketSignal = runAlphaEngine(snapshot);

    for (const watch of watches.filter((w) => w.tokenAddress === address)) {
      const previous = watch.lastCoilScore;
      const current = marketSignal.coil.coilScore;
      const crossedUp =
        previous !== null && previous < watch.coilThreshold && current >= watch.coilThreshold;
      // A first sweep that lands already above threshold is worth saying once.
      const firstLookAlreadyHot = previous === null && current >= watch.coilThreshold;

      if (crossedUp || firstLookAlreadyHot) {
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
        alertsFired++;
      }

      await prisma.watch.update({
        where: { id: watch.id },
        data: { lastCoilScore: current, lastSweptAt: new Date() },
      });
    }

    for (const position of openPositions.filter((p) => p.tokenAddress === address)) {
      const signal = runAlphaEngine(snapshot, {
        size: position.size,
        entryPriceUsd: position.entryPriceUsd,
      });
      const ladder = signal.ladder;
      if (!ladder) continue;

      if (snapshot.priceUsd <= ladder.hardStopUsd) {
        if (
          await createAlertOnce(position.userId, position.id, address, snapshot.symbol, 'STOP_HIT',
            `Hard stop hit at $${snapshot.priceUsd.toPrecision(3)}. ${ladder.stopNote}`, snapshot.priceUsd)
        ) alertsFired++;
        // A broken stop supersedes everything else this token could say.
        continue;
      }

      const filledRung = ladder.rungs.find((r) => snapshot.priceUsd >= r.priceUsd);
      if (filledRung) {
        if (
          await createAlertOnce(position.userId, position.id, address, snapshot.symbol, 'RUNG_HIT',
            `${(filledRung.fraction * 100).toFixed(0)}% rung filled at $${filledRung.priceUsd.toPrecision(3)}. ${filledRung.rationale}`,
            snapshot.priceUsd)
        ) alertsFired++;
      }

      if (signal.coil.insiderRealized > 0.35 && signal.coil.insiderCoil > 0.06) {
        if (
          await createAlertOnce(position.userId, position.id, address, snapshot.symbol, 'INSIDER_DUMP',
            `Insider cluster has realized ${(signal.coil.insiderRealized * 100).toFixed(0)}% of its bag. ${signal.headline}`,
            snapshot.priceUsd)
        ) alertsFired++;
      }
    }
  }

  // Everything above only wrote rows. This is what makes them alerts.
  const delivery = await flushPendingAlerts();

  return { swept, tokens: addresses.size, alertsFired, delivery };
}

/** Returns true when an alert was actually created. */
async function createAlertOnce(
  userId: string,
  positionId: string,
  tokenAddress: string,
  symbol: string,
  kind: string,
  message: string,
  priceUsd: number,
): Promise<boolean> {
  const recent = await prisma.alert.findFirst({
    where: { userId, positionId, kind, createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return false;

  await prisma.alert.create({
    data: { userId, positionId, tokenAddress, symbol, kind, message, priceUsd },
  });
  return true;
}

/* ------------------------------- score ---------------------------------- */

const HORIZON_MS = 4 * 60 * 60_000;
const MAX_AGE_MS = 48 * 60 * 60_000;
const SCORE_BATCH = 50;

export interface ScoreResult {
  graded: number;
  pending: number;
  considered: number;
}

/** Resolve past calls into the public track record. */
export async function runScore(): Promise<ScoreResult> {
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
    take: SCORE_BATCH,
  });

  if (due.length === 0) return { graded: 0, pending: 0, considered: 0 };

  // Price each distinct token once, not once per signal — and fetch every
  // distinct token concurrently rather than one at a time, for the same
  // reason the sweep does: up to SCORE_BATCH signals can span dozens of
  // distinct tokens, and a sequential fetch per token risks the job running
  // long enough to overlap its own next tick.
  const snapshotByToken = new Map<string, TokenSnapshot>();
  const uniqueAddresses = [...new Set(due.map((s) => s.tokenAddress))];
  const fetchResults = await mapWithConcurrency(
    uniqueAddresses,
    SNAPSHOT_FETCH_CONCURRENCY,
    (address) => buildSnapshot(address),
    (err, address) => {
      console.warn('[score] snapshot fetch failed for', address, err instanceof Error ? err.message : err);
      return null;
    },
  );

  for (let i = 0; i < uniqueAddresses.length; i++) {
    const result = fetchResults[i];
    // No live price, or the fetch failed outright — we cannot grade this
    // honestly either way, so the token is simply absent from the map and
    // every signal for it falls through to "still pending" below.
    if (!result || result.mode === 'demo') continue;
    snapshotByToken.set(uniqueAddresses[i] as string, result.snapshot);
  }

  let graded = 0;
  let stillPending = 0;

  for (const signal of due) {
    const snapshot = snapshotByToken.get(signal.tokenAddress);
    if (!snapshot) {
      stillPending++;
      continue;
    }

    const since = signal.createdAt.getTime() / 1000;
    const window = snapshot.candles.filter((c) => c.timeSec >= since);
    const priced = {
      price: snapshot.priceUsd,
      max: window.length ? Math.max(...window.map((c) => c.high)) : null,
      min: window.length ? Math.min(...window.map((c) => c.low)) : null,
    };

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

  return { graded, pending: stillPending, considered: due.length };
}

/* -------------------------------- scan ---------------------------------- */

/** Do not re-call the same token more often than this. */
const RESCAN_COOLDOWN_MS = 6 * 60 * 60_000;

export interface ScanResult {
  considered: number;
  called: number;
  skipped: { recentlyCalled: number; noLiveData: number; tooThin: number; lowConfidence: number };
}

/**
 * Autonomous market scan, so the public track record accumulates real graded
 * outcomes without waiting for traffic that will not arrive until the record is
 * worth reading.
 */
export async function runScan(): Promise<ScanResult> {
  const empty: ScanResult = {
    considered: 0,
    called: 0,
    skipped: { recentlyCalled: 0, noLiveData: 0, tooThin: 0, lowConfidence: 0 },
  };

  const candidates = await discoverCandidates(12);
  if (candidates.length === 0) return empty;

  const since = new Date(Date.now() - RESCAN_COOLDOWN_MS);
  const recent = await prisma.signal.findMany({
    where: { createdAt: { gte: since }, tokenAddress: { in: candidates.map((c) => c.address) } },
    select: { tokenAddress: true },
    distinct: ['tokenAddress'],
  });
  const recentlyCalled = new Set(recent.map((r) => r.tokenAddress));

  let called = 0;
  let noLiveData = 0;
  let tooThin = 0;
  let lowConfidence = 0;

  // Skip the already-called ones before spending a fetch on them, then fetch
  // the rest concurrently — 12 candidates sequentially is only a few seconds,
  // but there is no reason for this job to behave differently from sweep and
  // score, and consistency here is one less shape to remember.
  const toFetch = candidates.filter((c) => !recentlyCalled.has(c.address));
  const fetchResults = await mapWithConcurrency(
    toFetch,
    SNAPSHOT_FETCH_CONCURRENCY,
    (candidate) => buildSnapshot(candidate.address),
    (err, candidate) => {
      console.warn('[scan] snapshot fetch failed for', candidate.address, err instanceof Error ? err.message : err);
      return null;
    },
  );

  for (let i = 0; i < toFetch.length; i++) {
    const result = fetchResults[i];
    if (!result || result.mode === 'demo') {
      noLiveData++;
      continue;
    }

    const snapshot = result.snapshot;
    if (snapshot.liquidityUsd < SCAN_MIN_LIQUIDITY_USD) {
      tooThin++;
      continue;
    }

    await writeCachedSnapshot(snapshot);
    const signal = runAlphaEngine(snapshot);

    // A call we would not stand behind must not be counted in a number we
    // advertise. Low-confidence reads still help a user asking about a specific
    // token; they are not evidence of accuracy.
    if (signal.coil.confidence < TRACK_RECORD_CONFIDENCE_FLOOR) {
      lowConfidence++;
      continue;
    }

    await recordSignal(signal, null);
    called++;
  }

  return {
    considered: candidates.length,
    called,
    skipped: {
      recentlyCalled: candidates.filter((c) => recentlyCalled.has(c.address)).length,
      noLiveData,
      tooThin,
      lowConfidence,
    },
  };
}

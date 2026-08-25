import { cronAuthorized, jsonError, jsonOk } from '@/lib/api';
import { writeCachedSnapshot } from '@/lib/cache';
import { prisma } from '@/lib/db';
import { runAlphaEngine } from '@/lib/engine';
import { buildSnapshot } from '@/lib/providers';
import { discoverCandidates, SCAN_MIN_LIQUIDITY_USD } from '@/lib/providers/discover';
import { TRACK_RECORD_CONFIDENCE_FLOOR, recordSignal } from '@/lib/signal-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Autonomous market scan.
 *
 * Runs the engine against live tokens on its own schedule and logs the calls,
 * so the public track record accumulates real graded outcomes without waiting
 * for user traffic — traffic which will not arrive until the record is worth
 * reading. It also means the engine is continuously exposed to real market
 * structure rather than only to whatever a user happens to paste.
 *
 * These calls are recorded exactly like a user's: same engine, same scoring,
 * same ledger. Nothing here is allowed to flatter the numbers.
 */

/** Do not re-call the same token more often than this. */
const RESCAN_COOLDOWN_MS = 6 * 60 * 60_000;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return jsonError('Unauthorized.', 401);

  const candidates = await discoverCandidates(12);
  if (candidates.length === 0) {
    return jsonOk({ considered: 0, called: 0, note: 'No candidates came back from discovery.' });
  }

  // Skip anything we have already called recently — a ledger full of the same
  // token re-read every ten minutes would inflate the sample without adding
  // any information.
  const since = new Date(Date.now() - RESCAN_COOLDOWN_MS);
  const recent = await prisma.signal.findMany({
    where: { createdAt: { gte: since }, tokenAddress: { in: candidates.map((c) => c.address) } },
    select: { tokenAddress: true },
    distinct: ['tokenAddress'],
  });
  const recentlyCalled = new Set(recent.map((r) => r.tokenAddress));

  let called = 0;
  let skippedDemo = 0;
  let skippedThin = 0;
  let skippedLowConfidence = 0;

  for (const candidate of candidates) {
    if (recentlyCalled.has(candidate.address)) continue;

    const result = await buildSnapshot(candidate.address);
    // Synthetic data must never reach the ledger, and a fallback to demo means
    // we have no live read to record.
    if (result.mode === 'demo') {
      skippedDemo++;
      continue;
    }

    const snapshot = result.snapshot;
    if (snapshot.liquidityUsd < SCAN_MIN_LIQUIDITY_USD) {
      skippedThin++;
      continue;
    }

    await writeCachedSnapshot(snapshot);
    const signal = runAlphaEngine(snapshot);

    // A call we would not stand behind should not be counted in a number we
    // advertise. Low-confidence reads are still useful to a user asking about a
    // specific token; they are not evidence of accuracy.
    if (signal.coil.confidence < TRACK_RECORD_CONFIDENCE_FLOOR) {
      skippedLowConfidence++;
      continue;
    }

    await recordSignal(signal, null);
    called++;
  }

  return jsonOk({
    considered: candidates.length,
    called,
    skipped: {
      recentlyCalled: candidates.filter((c) => recentlyCalled.has(c.address)).length,
      noLiveData: skippedDemo,
      tooThin: skippedThin,
      lowConfidence: skippedLowConfidence,
    },
  });
}

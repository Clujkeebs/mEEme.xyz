import type { Verdict } from '@/lib/engine/types';

/**
 * The public accuracy rule.
 *
 * Every tool in this space claims a win rate and none of them will tell you how
 * it was measured. This file is that answer, fixed in code and versioned in
 * git, so the rule cannot be quietly retuned after the results come in.
 *
 * A call is graded on what it told you to *do*, not on whether price moved:
 * telling someone to exit is correct when exiting saved them money, and wrong
 * when it cost them a run. Both directions are scored.
 */

/** Bump when the rule changes. Old outcomes keep the version they were graded under. */
export const SCORING_VERSION = 1;

export type Grade = 'correct' | 'incorrect' | 'neutral' | 'pending';

/** Calls that tell you to reduce or stay out. */
const EXIT_SIDE: ReadonlySet<Verdict> = new Set<Verdict>([
  'EXIT_IMMEDIATELY',
  'SCALE_OUT_NOW',
  'NO_TOUCH',
]);

/** Calls that tell you to add or enter. */
const ENTRY_SIDE: ReadonlySet<Verdict> = new Set<Verdict>(['APEX_ENTRY', 'SCALE_IN']);

/**
 * Move required before a call counts either way. Below this the market did not
 * give a verdict, so neither do we — grading noise as a win is how everyone
 * else gets to 80%.
 */
const DECISIVE_MOVE = 0.1;

/** How far a HOLD may bleed before it was the wrong call. */
const HOLD_TOLERANCE = 0.2;

export interface OutcomeInput {
  verdict: Verdict;
  priceAtSignal: number;
  /** Price at the judgement horizon (4h). */
  priceAtHorizon: number | null;
  /** Highest and lowest price seen inside the window, when known. */
  maxPrice: number | null;
  minPrice: number | null;
}

export interface OutcomeResult {
  grade: Grade;
  /** Signed return the call produced for the trader, as a fraction. */
  edgePct: number | null;
}

export function gradeSignal(input: OutcomeInput): OutcomeResult {
  const { verdict, priceAtSignal, priceAtHorizon, maxPrice, minPrice } = input;

  if (!priceAtSignal || priceAtSignal <= 0 || priceAtHorizon === null || priceAtHorizon <= 0) {
    return { grade: 'pending', edgePct: null };
  }

  const change = (priceAtHorizon - priceAtSignal) / priceAtSignal;

  if (EXIT_SIDE.has(verdict)) {
    // Exiting is right when price fell. The edge is the drawdown you avoided.
    const edge = -change;
    if (change <= -DECISIVE_MOVE) return { grade: 'correct', edgePct: edge };
    // A call to exit that preceded a decisive run cost the trader that run.
    if (change >= DECISIVE_MOVE * 1.5) return { grade: 'incorrect', edgePct: edge };
    return { grade: 'neutral', edgePct: edge };
  }

  if (ENTRY_SIDE.has(verdict)) {
    if (change >= DECISIVE_MOVE) return { grade: 'correct', edgePct: change };
    if (change <= -DECISIVE_MOVE) return { grade: 'incorrect', edgePct: change };
    return { grade: 'neutral', edgePct: change };
  }

  if (verdict === 'ARM_EXIT') {
    // A warning is vindicated by the drawdown it warned about, even if price
    // recovered by the horizon — that is what a warning is for.
    const drawdown = minPrice !== null && minPrice > 0 ? (minPrice - priceAtSignal) / priceAtSignal : change;
    if (drawdown <= -DECISIVE_MOVE) return { grade: 'correct', edgePct: -drawdown };
    if (change >= DECISIVE_MOVE * 2) return { grade: 'incorrect', edgePct: -change };
    return { grade: 'neutral', edgePct: -change };
  }

  // HOLD_THROUGH_NOISE: right unless holding actually hurt.
  if (change <= -HOLD_TOLERANCE) return { grade: 'incorrect', edgePct: change };
  if (maxPrice !== null && maxPrice > 0 && (maxPrice - priceAtSignal) / priceAtSignal >= DECISIVE_MOVE) {
    return { grade: 'correct', edgePct: change };
  }
  return { grade: change > 0 ? 'correct' : 'neutral', edgePct: change };
}

export interface TrackRecordStats {
  total: number;
  correct: number;
  incorrect: number;
  neutral: number;
  pending: number;
  /** Correct / (correct + incorrect). Neutral calls are excluded, not counted as wins. */
  accuracy: number | null;
  /** Mean signed edge across all graded calls. */
  averageEdgePct: number | null;
}

export function summarize(
  rows: { grade: string; edgePct: number | null }[],
): TrackRecordStats {
  let correct = 0;
  let incorrect = 0;
  let neutral = 0;
  let pending = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (const r of rows) {
    if (r.grade === 'correct') correct++;
    else if (r.grade === 'incorrect') incorrect++;
    else if (r.grade === 'neutral') neutral++;
    else pending++;

    if (r.grade !== 'pending' && r.edgePct !== null && Number.isFinite(r.edgePct)) {
      edgeSum += r.edgePct;
      edgeCount++;
    }
  }

  const decided = correct + incorrect;
  return {
    total: rows.length,
    correct,
    incorrect,
    neutral,
    pending,
    accuracy: decided > 0 ? correct / decided : null,
    averageEdgePct: edgeCount > 0 ? edgeSum / edgeCount : null,
  };
}

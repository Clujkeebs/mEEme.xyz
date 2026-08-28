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

  // NO_SIGNAL is a refusal to call, not a call. Grading it either way would be
  // scoring the engine on a prediction it explicitly declined to make — and
  // counting the ones that happened to go up as wins is exactly the kind of
  // free credit this file exists to refuse.
  if (verdict === 'NO_SIGNAL') return { grade: 'neutral', edgePct: null };

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

/** Accuracy and payoff for one slice of the ledger. */
export interface SliceStats {
  correct: number;
  incorrect: number;
  neutral: number;
  /** Correct / (correct + incorrect). Neutral calls are excluded, not counted as wins. */
  accuracy: number | null;
  /** Mean signed edge across all graded calls in the slice. */
  averageEdgePct: number | null;
  /**
   * Mean edge of the winners and of the losers, separately.
   *
   * A win rate on its own is uninterpretable for this strategy and actively
   * misleading: the whole thesis is asymmetry — be wrong often, be right big.
   * Publishing "25% accurate" with no payoff attached invites a reader to
   * judge it against a coin flip, which is the wrong yardstick. These two
   * numbers are what make the accuracy figure mean anything, so they are
   * reported everywhere it is.
   */
  averageWinPct: number | null;
  averageLossPct: number | null;
}

export interface TrackRecordStats extends SliceStats {
  total: number;
  pending: number;
  /**
   * The same figures split by what the call told you to do.
   *
   * The engine is an exit engine; entry calls are a side effect of the scanner
   * running over tokens nobody holds. Collapsing both into one headline hides
   * which half is carrying the record, and that is the first thing anyone
   * assessing the tool actually needs to know.
   */
  entrySide: SliceStats;
  exitSide: SliceStats;
}

export interface SummaryRow {
  grade: string;
  edgePct: number | null;
  /** Omitted rows are counted in the totals but not in either side. */
  verdict?: Verdict | string | null;
}

/** Which half of the ledger a verdict belongs to, or null when unknown. */
export function sideOf(verdict: Verdict | string | null | undefined): 'entry' | 'exit' | null {
  if (!verdict) return null;
  if (ENTRY_SIDE.has(verdict as Verdict)) return 'entry';
  if (EXIT_SIDE.has(verdict as Verdict)) return 'exit';
  // ARM_EXIT and HOLD_THROUGH_NOISE are both "do not add here" calls: they are
  // judged on drawdown avoided, which is the exit side's question.
  if (verdict === 'ARM_EXIT' || verdict === 'HOLD_THROUGH_NOISE') return 'exit';
  return null;
}

function emptySlice(): {
  correct: number; incorrect: number; neutral: number;
  edgeSum: number; edgeCount: number;
  winSum: number; winCount: number; lossSum: number; lossCount: number;
} {
  return { correct: 0, incorrect: 0, neutral: 0, edgeSum: 0, edgeCount: 0, winSum: 0, winCount: 0, lossSum: 0, lossCount: 0 };
}

function finishSlice(a: ReturnType<typeof emptySlice>): SliceStats {
  const decided = a.correct + a.incorrect;
  return {
    correct: a.correct,
    incorrect: a.incorrect,
    neutral: a.neutral,
    accuracy: decided > 0 ? a.correct / decided : null,
    averageEdgePct: a.edgeCount > 0 ? a.edgeSum / a.edgeCount : null,
    averageWinPct: a.winCount > 0 ? a.winSum / a.winCount : null,
    averageLossPct: a.lossCount > 0 ? a.lossSum / a.lossCount : null,
  };
}

function accumulate(a: ReturnType<typeof emptySlice>, row: SummaryRow): void {
  if (row.grade === 'correct') a.correct++;
  else if (row.grade === 'incorrect') a.incorrect++;
  else if (row.grade === 'neutral') a.neutral++;

  if (row.grade === 'pending' || row.edgePct === null || !Number.isFinite(row.edgePct)) return;
  a.edgeSum += row.edgePct;
  a.edgeCount++;
  if (row.grade === 'correct') { a.winSum += row.edgePct; a.winCount++; }
  else if (row.grade === 'incorrect') { a.lossSum += row.edgePct; a.lossCount++; }
}

export function summarize(rows: SummaryRow[]): TrackRecordStats {
  const all = emptySlice();
  const entry = emptySlice();
  const exit = emptySlice();
  let pending = 0;

  for (const row of rows) {
    if (row.grade === 'pending') pending++;
    accumulate(all, row);
    const side = sideOf(row.verdict);
    if (side === 'entry') accumulate(entry, row);
    else if (side === 'exit') accumulate(exit, row);
  }

  return {
    total: rows.length,
    pending,
    ...finishSlice(all),
    entrySide: finishSlice(entry),
    exitSide: finishSlice(exit),
  };
}

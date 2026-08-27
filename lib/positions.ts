/**
 * Position marking and portfolio math.
 *
 * The product's whole promise is "the engine watches your bags while you
 * sleep", and until now the page where the bags live showed only what you
 * paid for them — a receipt, not a position. The sweep already fetches every
 * held token every five minutes and runs the engine against the exact
 * position; this turns that work into the numbers a trader actually opens the
 * dashboard for.
 *
 * Everything here is pure. No clock of its own, no network: `nowMs` is passed
 * in so staleness is testable rather than whatever the machine felt like.
 */

/** What the sweep last saw. Null throughout when a position has never been swept. */
export interface PositionMark {
  markPriceUsd: number | null;
  markedAt: string | null;
  markVerdict: string | null;
  markCoilScore: number | null;
  markStopUsd: number | null;
  markNextRungUsd: number | null;
  markNextRungFraction: number | null;
}

export interface MarkablePosition extends PositionMark {
  size: number;
  entryPriceUsd: number;
}

/** A mark older than this is shown as stale — the sweep runs every 5 minutes. */
export const MARK_STALE_AFTER_MS = 20 * 60_000;

export interface PositionValuation {
  /** False when the sweep has never touched this position. */
  marked: boolean;
  /** True when we have a mark but it is old enough to distrust. */
  stale: boolean;
  markAgeMs: number | null;
  costUsd: number;
  valueUsd: number | null;
  unrealizedPnlUsd: number | null;
  /** Fraction, not percent: 0.42 is +42%. */
  unrealizedPnlPct: number | null;
  /**
   * How far price can fall before the structural stop, as a fraction of the
   * mark. Null when there is no stop or the stop is already broken — a broken
   * stop is not "0% away", it is a different situation and says so.
   */
  stopDistancePct: number | null;
  stopBroken: boolean;
  /** How far up to the next unfilled rung, as a fraction of the mark. */
  nextRungDistancePct: number | null;
}

export function valuePosition(position: MarkablePosition, nowMs: number): PositionValuation {
  const costUsd = position.size * position.entryPriceUsd;
  const mark = position.markPriceUsd;

  if (mark === null || !Number.isFinite(mark) || mark <= 0) {
    return {
      marked: false,
      stale: false,
      markAgeMs: null,
      costUsd,
      valueUsd: null,
      unrealizedPnlUsd: null,
      unrealizedPnlPct: null,
      stopDistancePct: null,
      stopBroken: false,
      nextRungDistancePct: null,
    };
  }

  const markedAtMs = position.markedAt ? Date.parse(position.markedAt) : NaN;
  const markAgeMs = Number.isFinite(markedAtMs) ? Math.max(0, nowMs - markedAtMs) : null;

  const valueUsd = position.size * mark;
  const unrealizedPnlUsd = valueUsd - costUsd;
  const unrealizedPnlPct =
    position.entryPriceUsd > 0 ? (mark - position.entryPriceUsd) / position.entryPriceUsd : null;

  const stop = position.markStopUsd;
  const stopBroken = stop !== null && Number.isFinite(stop) && mark <= stop;
  const stopDistancePct =
    stop !== null && Number.isFinite(stop) && stop > 0 && !stopBroken ? (mark - stop) / mark : null;

  const rung = position.markNextRungUsd;
  const nextRungDistancePct =
    rung !== null && Number.isFinite(rung) && rung > mark ? (rung - mark) / mark : null;

  return {
    marked: true,
    stale: markAgeMs !== null && markAgeMs > MARK_STALE_AFTER_MS,
    markAgeMs,
    costUsd,
    valueUsd,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    stopDistancePct,
    stopBroken,
    nextRungDistancePct,
  };
}

export interface ClosedTrade {
  realizedPnlUsd: number | null;
}

export interface PortfolioSummary {
  openCount: number;
  /** Cost of every open position, marked or not. */
  openCostUsd: number;
  /** Value of the open positions we could mark. */
  markedValueUsd: number;
  markedCostUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number | null;
  /** Open positions with no mark yet — the totals above exclude them. */
  unmarkedCount: number;
  /** Oldest mark among the marked positions, so the UI can date the whole readout. */
  oldestMarkAgeMs: number | null;
  anyStale: boolean;

  closedCount: number;
  realizedPnlUsd: number;
  wins: number;
  losses: number;
  /** Fraction of *decided* trades that won. Null when nothing is closed yet. */
  winRate: number | null;
  bestUsd: number | null;
  worstUsd: number | null;
}

export function summarizePortfolio(
  open: MarkablePosition[],
  closed: ClosedTrade[],
  nowMs: number,
): PortfolioSummary {
  let openCostUsd = 0;
  let markedValueUsd = 0;
  let markedCostUsd = 0;
  let unmarkedCount = 0;
  let oldestMarkAgeMs: number | null = null;
  let anyStale = false;

  for (const position of open) {
    const v = valuePosition(position, nowMs);
    openCostUsd += v.costUsd;
    if (!v.marked || v.valueUsd === null) {
      unmarkedCount++;
      continue;
    }
    markedValueUsd += v.valueUsd;
    markedCostUsd += v.costUsd;
    if (v.stale) anyStale = true;
    if (v.markAgeMs !== null && (oldestMarkAgeMs === null || v.markAgeMs > oldestMarkAgeMs)) {
      oldestMarkAgeMs = v.markAgeMs;
    }
  }

  const unrealizedPnlUsd = markedValueUsd - markedCostUsd;

  // A realized PnL of exactly zero is a real outcome and not a win, so wins and
  // losses need not sum to closedCount. Reporting a win rate over the total
  // would quietly understate it.
  let realizedPnlUsd = 0;
  let wins = 0;
  let losses = 0;
  let bestUsd: number | null = null;
  let worstUsd: number | null = null;

  for (const trade of closed) {
    const pnl = trade.realizedPnlUsd;
    if (pnl === null || !Number.isFinite(pnl)) continue;
    realizedPnlUsd += pnl;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
    if (bestUsd === null || pnl > bestUsd) bestUsd = pnl;
    if (worstUsd === null || pnl < worstUsd) worstUsd = pnl;
  }

  const decided = wins + losses;

  return {
    openCount: open.length,
    openCostUsd: round2(openCostUsd),
    markedValueUsd: round2(markedValueUsd),
    markedCostUsd: round2(markedCostUsd),
    unrealizedPnlUsd: round2(unrealizedPnlUsd),
    unrealizedPnlPct: markedCostUsd > 0 ? unrealizedPnlUsd / markedCostUsd : null,
    unmarkedCount,
    oldestMarkAgeMs,
    anyStale,
    closedCount: closed.length,
    realizedPnlUsd: round2(realizedPnlUsd),
    wins,
    losses,
    winRate: decided > 0 ? wins / decided : null,
    bestUsd,
    worstUsd,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

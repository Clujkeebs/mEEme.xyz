import { clamp } from './coil';
import type {
  CoilReport,
  ExitLadder,
  LadderRung,
  TokenSnapshot,
  UserPosition,
  Verdict,
} from './types';

/**
 * Ladder construction.
 *
 * The point of a ladder is to make the decision before the candle makes it for
 * you. Levels come from supply structure wherever structure exists, and from
 * realized volatility only where it does not — never from round numbers.
 */

/** Fallback stop distance when no coiled shelf gives us a structural one. */
const FALLBACK_STOP_PCT = 0.35;
/** Snap a computed target onto a real shelf if it sits within this distance. */
const SHELF_SNAP_TOLERANCE = 0.2;
/** Volatility multiples for the three default rungs. */
const RUNG_VOLATILITY_MULTIPLES = [1.5, 3.5, 7] as const;
const DEFAULT_ATR_PCT = 0.15;

const fmtUsd = (v: number): string => {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1) return `$${v.toFixed(4)}`;
  if (v >= 0.0001) return `$${v.toFixed(6)}`;
  return `$${v.toExponential(2)}`;
};

/**
 * Average true range as a fraction of price. Memecoins do not have a "normal"
 * daily range, so this is measured over whatever candles we actually have.
 */
export function atrPercent(snapshot: TokenSnapshot, lookback = 24): number {
  const candles = snapshot.candles.slice(-lookback);
  if (candles.length < 3) return DEFAULT_ATR_PCT;

  let sum = 0;
  let count = 0;
  for (const c of candles) {
    if (!Number.isFinite(c.close) || c.close <= 0) continue;
    sum += (c.high - c.low) / c.close;
    count += 1;
  }
  if (count === 0) return DEFAULT_ATR_PCT;
  return clamp(sum / count, 0.03, 1.5);
}

/** Pull a computed target onto nearby real supply, where real supply exists. */
function snapToShelf(target: number, coil: CoilReport, spot: number): { price: number; snapped: boolean } {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const shelf of coil.shelves) {
    if (shelf.priceUsd <= spot) continue; // only overhead supply is a target
    const distance = Math.abs(shelf.priceUsd - target) / target;
    if (distance <= SHELF_SNAP_TOLERANCE && distance < bestDistance) {
      bestDistance = distance;
      best = shelf.priceUsd;
    }
  }

  return best === null ? { price: target, snapped: false } : { price: best, snapped: true };
}

/**
 * Structural stop. The trapdoor is the price at which the largest block of
 * currently-profitable supply goes to breakeven — the level where paper gains
 * turn into a stampede for the door.
 */
export function resolveHardStop(snapshot: TokenSnapshot, coil: CoilReport): number {
  if (coil.trapdoorUsd !== null && coil.trapdoorUsd > 0 && coil.trapdoorUsd < snapshot.priceUsd) {
    // Sit just under the shelf: you want to be out before the cascade, not in it.
    return coil.trapdoorUsd * 0.97;
  }
  return snapshot.priceUsd * (1 - FALLBACK_STOP_PCT);
}

/**
 * How much of the position stays on the table after the ladder is done.
 * Runners are a luxury paid for by low coil — when the gun is loaded you do
 * not get one.
 */
export function runnerFraction(coilScore: number): number {
  return clamp(0.3 * Math.pow(1 - clamp(coilScore, 0, 1), 1.5), 0, 0.3);
}

export function buildLadder(
  snapshot: TokenSnapshot,
  coil: CoilReport,
  verdict: Verdict,
  position: UserPosition | null,
): ExitLadder {
  const spot = snapshot.priceUsd;
  const hardStop = resolveHardStop(snapshot, coil);
  const runner = runnerFraction(coil.coilScore);
  const atr = atrPercent(snapshot);

  // High coil compresses targets: when distribution has started you take what
  // is in front of you rather than what you hoped for.
  const compression = 1 - 0.5 * clamp(coil.coilScore, 0, 1);

  const urgentNow = verdict === 'EXIT_IMMEDIATELY' || verdict === 'SCALE_OUT_NOW' || verdict === 'NO_TOUCH';

  const rungCount = coil.coilScore > 0.8 ? 2 : coil.coilScore > 0.5 ? 3 : 3;
  const ladderBudget = 1 - runner;

  // Front-load in proportion to threat.
  const firstWeight = clamp(0.3 + 0.45 * coil.coilScore, 0.3, 0.75);
  const weights: number[] = [];
  if (rungCount === 2) {
    weights.push(firstWeight, 1 - firstWeight);
  } else {
    const remaining = 1 - firstWeight;
    weights.push(firstWeight, remaining * 0.6, remaining * 0.4);
  }

  const rungs: LadderRung[] = [];

  for (let i = 0; i < rungCount; i++) {
    const weight = weights[i] ?? 0;
    const fraction = weight * ladderBudget;
    if (fraction <= 0.001) continue;

    let priceUsd: number;
    let rationale: string;

    if (i === 0 && urgentNow) {
      priceUsd = spot;
      rationale =
        verdict === 'EXIT_IMMEDIATELY'
          ? 'Market. The distribution is already running; price is the only thing you still control.'
          : 'Market. Insider supply is converting to cash — you do not want to be the last fill.';
    } else {
      const multiple = RUNG_VOLATILITY_MULTIPLES[i] ?? RUNG_VOLATILITY_MULTIPLES[2];
      const raw = spot * (1 + atr * multiple * compression);
      const { price, snapped } = snapToShelf(raw, coil, spot);
      priceUsd = price;
      rationale = snapped
        ? `Overhead supply sits here — ${(shelfFractionAt(coil, price) * 100).toFixed(1)}% of float goes breakeven at this level and will sell into you.`
        : `${(atr * multiple * compression * 100).toFixed(0)}% above spot — ${multiple}× the token's own average range, compressed for a coil of ${coil.coilScore.toFixed(2)}.`;
    }

    rungs.push({
      fraction,
      priceUsd,
      multipleOnEntry: position ? priceUsd / position.entryPriceUsd : null,
      rationale,
    });
  }

  // Keep the ladder monotonic — a later rung below an earlier one is nonsense.
  for (let i = 1; i < rungs.length; i++) {
    const prev = rungs[i - 1];
    const cur = rungs[i];
    if (prev && cur && cur.priceUsd <= prev.priceUsd) {
      cur.priceUsd = prev.priceUsd * (1 + atr * 0.5);
      cur.multipleOnEntry = position ? cur.priceUsd / position.entryPriceUsd : null;
    }
  }

  const takenNow = rungs[0] && urgentNow ? rungs[0].fraction : 0;
  const summary = buildSummary({ rungs, runner, hardStop, takenNow, position, spot });

  return { rungs, runnerFraction: runner, hardStopUsd: hardStop, summary };
}

function shelfFractionAt(coil: CoilReport, priceUsd: number): number {
  const match = coil.shelves.find((s) => Math.abs(s.priceUsd - priceUsd) / priceUsd < 1e-6);
  return match?.supplyFraction ?? 0;
}

function buildSummary(args: {
  rungs: LadderRung[];
  runner: number;
  hardStop: number;
  takenNow: number;
  position: UserPosition | null;
  spot: number;
}): string {
  const { rungs, runner, hardStop, takenNow, position, spot } = args;
  const parts: string[] = [];

  if (takenNow > 0) {
    parts.push(`Take ${(takenNow * 100).toFixed(0)}% at market now`);
  } else if (rungs[0]) {
    parts.push(`${(rungs[0].fraction * 100).toFixed(0)}% at ${fmtUsd(rungs[0].priceUsd)}`);
  }

  for (let i = takenNow > 0 ? 1 : 1; i < rungs.length; i++) {
    const r = rungs[i];
    if (r) parts.push(`${(r.fraction * 100).toFixed(0)}% at ${fmtUsd(r.priceUsd)}`);
  }

  if (runner > 0.005) parts.push(`${(runner * 100).toFixed(0)}% runs`);

  const stopPct = ((hardStop - spot) / spot) * 100;
  parts.push(`hard stop ${fmtUsd(hardStop)} (${stopPct.toFixed(0)}%)`);

  const pnl = position
    ? ` You are ${(spot / position.entryPriceUsd).toFixed(2)}× on entry.`
    : '';

  return `${parts.join(' · ')}.${pnl}`;
}

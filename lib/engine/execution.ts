import type {
  Chain,
  ExitLadder,
  LadderExecutionSummary,
  LadderRung,
  RungExecutionSummary,
  TokenSnapshot,
  UserPosition,
} from './types';

/**
 * Execution reality.
 *
 * The ladder in `ladder.ts` is built from supply structure alone. That is the
 * right way to build it — structure does not care how much money you have — but
 * it produces a plan that is only *half* a plan, because taking a rung costs
 * money and moves the price, and both of those scale with the size of the
 * position rather than the shape of the chart.
 *
 * The failure mode this module exists to kill runs in both directions:
 *
 *   - A trader with $2 in a position is handed "31% at market, 41% here, 28%
 *     there". Three Solana swaps against $2 is three network fees and three
 *     rounds of taker fee against sixty-cent clips. The plan is arithmetically
 *     worse than a single sell, and nothing in the app said so.
 *
 *   - A trader with $60k in a pool holding $90k of liquidity is handed the same
 *     three rungs at three quoted prices. Those prices are fiction: their own
 *     first rung is a quarter of the pool and moves the market through the
 *     level before it fills. The ladder was written as though their order had
 *     no effect on the thing it was trading against.
 *
 * Same engine, same structural read, two answers — because the cost of acting
 * on it is the part that depends on you. Everything here is pure arithmetic on
 * the snapshot and the position; no network, no clock.
 */

export interface ChainCosts {
  /**
   * USD cost of getting one swap to land, independent of its size. On Solana
   * the base fee is dust and this is almost entirely the priority fee you have
   * to pay for a memecoin swap to survive a busy block; on Ethereum it is gas.
   */
  networkFeeUsd: number;
  /**
   * Proportional cost of one swap: pool fee plus router/aggregator take. Does
   * not include price impact, which depends on pool depth and is computed
   * separately.
   */
  takerFeePct: number;
}

/**
 * Deliberately mid-range rather than best-case. A cost model that flatters
 * execution is worse than no cost model, because it produces plans that look
 * affordable and are not. These are what a retail swap actually clears at on a
 * normal day, not what it clears at on an empty block.
 */
export const CHAIN_COSTS: Record<Chain, ChainCosts> = {
  solana: { networkFeeUsd: 0.04, takerFeePct: 0.011 },
  base: { networkFeeUsd: 0.05, takerFeePct: 0.01 },
  ethereum: { networkFeeUsd: 3.5, takerFeePct: 0.01 },
};

/** A rung costing more than this share of its own proceeds is not worth taking alone. */
const MAX_RUNG_COST_PCT = 0.05;
/** Slice a rung until no single clip gives up more than this to impact. */
const MAX_CLIP_IMPACT = 0.02;
/** Past this the position does not fit the pool, and more clips is not the answer. */
const MAX_CLIPS = 20;
/**
 * Slicing a rung is routine advice; telling a trader their own order *is* the
 * market is a headline. Those want different thresholds — a $1.5k sell into a
 * $120k pool is worth splitting in two and is nowhere near a warning, so the
 * headline waits until a rung gives up a twentieth of itself to its own impact.
 */
const HEAVY_IMPACT = 0.05;
/** The exit cost an ordinary position should be able to stay under. */
const TARGET_EXIT_COST_PCT = 0.03;

/**
 * Fraction of value given up to price impact when selling `notionalUsd` into a
 * pool reporting `liquidityUsd` of total liquidity.
 *
 * Constant product, which is what the pools these tokens trade in actually are.
 * With reserves (T, Q) and spot p = Q/T, selling Δt tokens returns
 * Q·Δt/(T+Δt) against a mark-to-spot value of p·Δt, so the shortfall is
 * r/(1+r) with r = Δt/T. Reported liquidity counts both sides of the pool, so
 * the quote reserve is half of it and r = 2·notional/liquidity.
 *
 * This is the honest floor, not the whole story — it assumes the pool is the
 * only venue and nobody front-runs the exit. Both of those make it worse.
 */
export function priceImpactFraction(notionalUsd: number, liquidityUsd: number): number {
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return 0;
  // No depth reported is not the same as infinite depth. Treat it as total.
  if (!Number.isFinite(liquidityUsd) || liquidityUsd <= 0) return 1;
  const r = (2 * notionalUsd) / liquidityUsd;
  return r / (1 + r);
}

/**
 * The smallest sell worth making on its own: below this the fixed network fee
 * alone eats more than MAX_RUNG_COST_PCT of the proceeds, so splitting a
 * position into pieces this size destroys more value than the ladder saves.
 */
export function minimumEconomicClipUsd(chain: Chain): number {
  const costs = CHAIN_COSTS[chain];
  const headroom = MAX_RUNG_COST_PCT - costs.takerFeePct;
  // A chain whose proportional fee alone exceeds the threshold has no size at
  // which splitting is free; fall back to a fee-multiple floor.
  if (headroom <= 0) return costs.networkFeeUsd * 50;
  return costs.networkFeeUsd / headroom;
}

/**
 * What one rung costs to execute. Structurally identical to
 * `RungExecutionSummary` in types.ts, which is where it is declared so
 * `ExitLadder` can reference it without importing this module.
 *
 * `clips` is the count of separate orders this rung has to be broken into for
 * each to clear under MAX_CLIP_IMPACT; 1 means it fills in one go. It is not a
 * discount — in a constant-product pool with no time between clips the total
 * given up is identical, so `impactUsd` is still computed on the full rung.
 * What slicing buys is the chance for other flow to refill the pool between
 * orders, which is the claim "this has to be worked, not dumped".
 */
export type RungExecution = RungExecutionSummary;

/**
 * The cost side of an exit plan. Declared in types.ts as
 * `LadderExecutionSummary` for the same no-cycle reason as above.
 *
 * `breakevenMultiple` is the one a trader should read first: the multiple on
 * entry that merely gets the money back once both sides of the round trip are
 * paid for. Under 1.01 it is noise; at small size on a thin pool it is most of
 * the trade.
 */
export type LadderExecution = LadderExecutionSummary;

const fmtUsd = (v: number): string =>
  v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`;

const pct = (v: number): string => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

/** Cost of a single sell of `grossUsd`, given the pool and the chain. */
function costOf(grossUsd: number, snapshot: TokenSnapshot, clips: number): Omit<RungExecution, 'clips'> {
  const costs = CHAIN_COSTS[snapshot.chain];
  const networkFeeUsd = costs.networkFeeUsd * clips;
  const takerFeeUsd = grossUsd * costs.takerFeePct;
  const impactUsd = grossUsd * priceImpactFraction(grossUsd, snapshot.liquidityUsd);
  const costUsd = networkFeeUsd + takerFeeUsd + impactUsd;
  return {
    grossUsd,
    networkFeeUsd,
    takerFeeUsd,
    impactUsd,
    costUsd,
    costPct: grossUsd > 0 ? costUsd / grossUsd : 0,
    netUsd: grossUsd - costUsd,
  };
}

/**
 * How many orders this rung needs for each to clear under MAX_CLIP_IMPACT.
 *
 * Capped at MAX_CLIPS, and at the cap the guarantee no longer holds — that is
 * the point. A position needing more than twenty clips to trade politely does
 * not fit the pool, and the honest answer is "this does not fit", not "here are
 * ninety orders".
 */
export function clipsFor(grossUsd: number, liquidityUsd: number): number {
  if (priceImpactFraction(grossUsd, liquidityUsd) <= MAX_CLIP_IMPACT) return 1;
  if (!Number.isFinite(liquidityUsd) || liquidityUsd <= 0) return MAX_CLIPS;
  // impact(S/n) <= m  ⟺  2S/(n·L) <= m/(1-m)  ⟺  n >= 2S(1-m)/(m·L)
  const n = Math.ceil((2 * grossUsd * (1 - MAX_CLIP_IMPACT)) / (MAX_CLIP_IMPACT * liquidityUsd));
  return Math.min(Math.max(n, 1), MAX_CLIPS);
}

/**
 * Cost of exiting a whole position of `notionalUsd` in a single sell, as a
 * fraction of it. This is the curve the size band is read off.
 *
 * It is not monotonic, which is the interesting part and the thing no other
 * tool says out loud. The fixed network fee is a fraction that *falls* as the
 * position grows; price impact is a fraction that *rises*. So exit cost is a U:
 * tiny positions are eaten by fees, huge positions are eaten by their own
 * market impact, and there is a band in the middle where a trade is worth
 * making at all. Both ends of that band come out of the same three numbers.
 */
export function singleSellCostPct(notionalUsd: number, chain: Chain, liquidityUsd: number): number {
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return 1;
  const costs = CHAIN_COSTS[chain];
  return Math.min(
    1,
    costs.networkFeeUsd / notionalUsd + costs.takerFeePct + priceImpactFraction(notionalUsd, liquidityUsd),
  );
}

/**
 * The range of position sizes whose exit stays under TARGET_EXIT_COST_PCT in
 * this pool, on this chain.
 *
 * Null when no size clears the bar — a pool thin enough that every position is
 * either fee-dominated or impact-dominated is a pool with no good trade in it,
 * and saying so is more use than quoting a band that does not exist.
 *
 * Solved numerically rather than in closed form: the curve is a sum of a
 * hyperbola and a saturating term, the algebra is a quadratic with branches
 * that are easy to get subtly wrong, and a bisection over a known-convex
 * function is both obviously correct and fast enough to run per request.
 */
export function workableSizeBand(
  chain: Chain,
  liquidityUsd: number,
): { minUsd: number; maxUsd: number } | null {
  if (!Number.isFinite(liquidityUsd) || liquidityUsd <= 0) return null;
  const cost = (n: number) => singleSellCostPct(n, chain, liquidityUsd);

  // Locate the bottom of the U by ternary search in log space, which keeps the
  // step size sane across the seven orders of magnitude between a $2 position
  // and a seven-figure one.
  let lo = Math.log(0.01);
  let hi = Math.log(Math.max(liquidityUsd * 10, 1_000));
  for (let i = 0; i < 200; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (cost(Math.exp(a)) < cost(Math.exp(b))) hi = b;
    else lo = a;
  }
  const best = Math.exp((lo + hi) / 2);
  if (cost(best) > TARGET_EXIT_COST_PCT) return null;

  // Cost falls monotonically to `best` and rises monotonically after it, so a
  // plain bisection on each side finds the two crossings.
  const bisect = (from: number, to: number): number => {
    let a = from;
    let b = to;
    for (let i = 0; i < 200; i++) {
      const mid = (a + b) / 2;
      if (cost(mid) <= TARGET_EXIT_COST_PCT) b = mid;
      else a = mid;
    }
    return (a + b) / 2;
  };

  const minUsd = cost(0.01) <= TARGET_EXIT_COST_PCT ? 0.01 : bisect(0.01, best);
  const ceiling = Math.max(liquidityUsd * 10, best * 10);
  const maxUsd = cost(ceiling) <= TARGET_EXIT_COST_PCT ? ceiling : bisect(ceiling, best);

  return { minUsd, maxUsd };
}

/**
 * Merge a ladder down to `keep` rungs.
 *
 * The first rung survives intact and the tail collapses into one, which is the
 * right shape for both reasons a ladder gets collapsed. When the first rung is
 * a market sell it is the urgent part of the plan and must not be averaged into
 * a limit above spot; when it is not, the near target is the one most likely to
 * actually print, and the far targets are the speculative tail.
 */
function mergeTail(
  rungs: LadderRung[],
  keep: number,
  position: UserPosition,
  spotUsd: number,
): LadderRung[] {
  if (keep >= rungs.length || rungs.length === 0) return rungs;
  const head = rungs.slice(0, Math.max(keep - 1, 0));
  const tail = rungs.slice(Math.max(keep - 1, 0));

  const fraction = tail.reduce((s, r) => s + r.fraction, 0);
  if (fraction <= 0) return head;

  // Size-weighted so the merged level carries the same expected proceeds as the
  // rungs it replaces, rather than whichever price happened to be listed first.
  const weighted = tail.reduce((s, r) => s + r.priceUsd * r.fraction, 0) / fraction;

  // Except when the tail starts at market. `buildLadder` puts the first rung at
  // spot on an urgent verdict — that rung is "get out now", and a position small
  // enough to collapse to a single sell is exactly the case where head is empty
  // and the market rung would be averaged in with targets above it. Doing that
  // would answer EXIT_IMMEDIATELY with a limit order the price has to rally into.
  // The urgency wins: everything collapses into the market sell.
  const first = tail[0];
  const marketSell = head.length === 0 && first !== undefined && first.priceUsd <= spotUsd * 1.0001;
  const priceUsd = marketSell ? first.priceUsd : weighted;

  const merged: LadderRung = {
    fraction,
    priceUsd,
    multipleOnEntry: priceUsd / position.entryPriceUsd,
    rationale:
      tail.length === 1
        ? (tail[0]?.rationale ?? '')
        : marketSell
          ? `${tail.length} rungs collapsed into this one. The call is to sell now, and a position this ` +
            `size cannot pay for a staged exit — so the whole thing goes at market rather than leaving ` +
            `most of it sitting on limits above a price that is being distributed into.`
          : `${tail.length} structural targets merged into one. At this size each separate sell would ` +
            `give up more to fees than staging the exit could win back, so this is their size-weighted level.`,
  };

  return [...head, merged];
}

/**
 * Rewrite a structurally-correct ladder into one this particular position can
 * actually execute, and report what executing it costs.
 *
 * Returns the ladder unchanged with `execution: null` when there is no position
 * — without a size there is no notional, and every number here is a function of
 * notional.
 */
export function applyExecutionReality(
  ladder: ExitLadder,
  snapshot: TokenSnapshot,
  position: UserPosition | null,
): ExitLadder {
  if (!position || !Number.isFinite(position.size) || position.size <= 0) {
    return { ...ladder, execution: null };
  }

  const positionUsd = position.size * snapshot.priceUsd;
  if (!Number.isFinite(positionUsd) || positionUsd <= 0) {
    return { ...ladder, execution: null };
  }

  const costs = CHAIN_COSTS[snapshot.chain];
  const minClip = minimumEconomicClipUsd(snapshot.chain);
  const proposedRungs = ladder.rungs.length;

  // How many separate sells this position can pay for at all.
  const affordable = Math.max(1, Math.floor(positionUsd / minClip));
  let rungs = mergeTail(ladder.rungs, Math.min(affordable, proposedRungs), position, snapshot.priceUsd);

  // The runner is a fourth sell that happens later. If the position cannot pay
  // for a sell that size, leaving it on is not patience — it is a fee waiting
  // to happen against a stake too small to matter.
  let runnerFraction = ladder.runnerFraction;
  const runnerUsd = runnerFraction * positionUsd;
  const runnerDropped = runnerFraction > 0.005 && runnerUsd < minClip;
  if (runnerDropped) {
    const last = rungs[rungs.length - 1];
    if (last) {
      rungs = [
        ...rungs.slice(0, -1),
        { ...last, fraction: last.fraction + runnerFraction },
      ];
    }
    runnerFraction = 0;
  }

  const collapsed = rungs.length < proposedRungs || runnerDropped;

  const execRungs: RungExecution[] = rungs.map((r) => {
    const gross = r.fraction * positionUsd;
    const clips = clipsFor(gross, snapshot.liquidityUsd);
    return { ...costOf(gross, snapshot, clips), clips };
  });

  const totalCost = execRungs.reduce((s, r) => s + r.costUsd, 0);
  const exitCostPct = totalCost / positionUsd;
  const worstImpact = Math.max(
    0,
    ...execRungs.map((r) => (r.grossUsd > 0 ? r.impactUsd / r.grossUsd : 0)),
  );
  const sizeConstrained = worstImpact >= HEAVY_IMPACT;

  // The entry is already behind them and we do not know what it cost, so the
  // buy side is modelled as the same position bought in one order. It is an
  // estimate and the note says so.
  const buyCostPct = Math.min(
    0.99,
    costs.networkFeeUsd / positionUsd +
      costs.takerFeePct +
      priceImpactFraction(positionUsd, snapshot.liquidityUsd),
  );
  const breakevenMultiple =
    exitCostPct >= 0.99 ? Number.POSITIVE_INFINITY : (1 + buyCostPct) / (1 - exitCostPct);

  const workableBand = workableSizeBand(snapshot.chain, snapshot.liquidityUsd);
  const outsideBand =
    workableBand !== null && (positionUsd < workableBand.minUsd || positionUsd > workableBand.maxUsd);

  const note = buildNote({
    positionUsd,
    minClip,
    proposedRungs,
    keptRungs: rungs.length,
    collapsed,
    runnerDropped,
    sizeConstrained,
    worstImpact,
    exitCostPct,
    breakevenMultiple,
    maxClips: Math.max(1, ...execRungs.map((r) => r.clips)),
    liquidityUsd: snapshot.liquidityUsd,
    workableBand,
    outsideBand,
  });

  return {
    ...ladder,
    rungs,
    runnerFraction,
    execution: {
      chain: snapshot.chain,
      positionUsd,
      rungs: execRungs,
      exitCostPct,
      breakevenMultiple,
      proposedRungs,
      collapsed,
      sizeConstrained,
      workableBand,
      outsideBand,
      note,
    },
  };
}

function buildNote(a: {
  positionUsd: number;
  minClip: number;
  proposedRungs: number;
  keptRungs: number;
  collapsed: boolean;
  runnerDropped: boolean;
  sizeConstrained: boolean;
  worstImpact: number;
  exitCostPct: number;
  breakevenMultiple: number;
  maxClips: number;
  liquidityUsd: number;
  workableBand: { minUsd: number; maxUsd: number } | null;
  outsideBand: boolean;
}): string {
  const cost = `Getting out costs about ${pct(a.exitCostPct)} of the position`;
  const be = Number.isFinite(a.breakevenMultiple)
    ? `, so ${a.breakevenMultiple.toFixed(2)}× on your entry is where you start making money rather than getting your own money back`
    : '';

  const band = bandSentence(a);

  if (a.sizeConstrained) {
    return (
      `${fmtUsd(a.positionUsd)} against ${fmtUsd(a.liquidityUsd)} of pool liquidity: your own exit is ` +
      `the move. The largest rung gives up ${pct(a.worstImpact)} to price impact on its own and needs ` +
      `working in about ${a.maxClips} orders rather than one — the quoted level is where the fill ` +
      `starts, not where it ends. ${cost}${be}.${band}`
    );
  }

  if (a.collapsed) {
    const why =
      a.keptRungs === 1
        ? `A ${fmtUsd(a.positionUsd)} position cannot pay for a staged exit: below about ` +
          `${fmtUsd(a.minClip)} a sell loses more to the fixed network fee than staging can win back. ` +
          `The ${a.proposedRungs} structural rungs are one exit here`
        : `${fmtUsd(a.positionUsd)} only pays for ${a.keptRungs} sells, not ${a.proposedRungs} — ` +
          `below about ${fmtUsd(a.minClip)} a clip the fee outruns the plan`;
    const runner = a.runnerDropped ? ', and the runner is too small to be worth a separate fee' : '';
    return `${why}${runner}. ${cost}${be}.${band}`;
  }

  // Only worth saying when there is more than one rung — "every rung is large
  // enough" about a single rung is a claim about nothing.
  const staged = a.keptRungs > 1 ? ' Every rung is large enough to be worth taking on its own.' : '';
  return `${cost}${be}.${staged}${band}`;
}

/**
 * The band only earns a sentence when the trader is outside it. Inside it, the
 * cost figure already said everything — repeating the bounds would be noise on
 * a plan that is fine.
 */
function bandSentence(a: {
  positionUsd: number;
  workableBand: { minUsd: number; maxUsd: number } | null;
  outsideBand: boolean;
}): string {
  const b = a.workableBand;
  if (!b) {
    return (
      ' This pool is too thin for any size to trade cheaply: below the fixed fee eats the position, ' +
      'above it your own impact does. There is no good size here, only less bad ones.'
    );
  }
  if (!a.outsideBand) return '';
  return a.positionUsd < b.minUsd
    ? ` For this pool the sizes that trade cheaply start around ${fmtUsd(b.minUsd)} — under that, fees ` +
      `are the trade. That is not a reason to size up; it is a reason to expect a bigger move before ` +
      `this one pays.`
    : ` For this pool the sizes that trade cheaply top out around ${fmtUsd(b.maxUsd)}. Past that you are ` +
      `the largest thing in the pool and the price you get is the price you make.`;
}

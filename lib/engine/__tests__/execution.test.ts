import { describe, expect, it } from 'vitest';
import {
  applyExecutionReality,
  CHAIN_COSTS,
  clipsFor,
  minimumEconomicClipUsd,
  priceImpactFraction,
  singleSellCostPct,
  workableSizeBand,
} from '../execution';
import { buildLadder } from '../ladder';
import { analyzeCoil } from '../coil';
import { snapshot } from './factory';
import type { CoilReport, ExitLadder, LadderRung, TokenSnapshot, UserPosition } from '../types';

function coilOf(over: Partial<CoilReport> = {}): CoilReport {
  return {
    coiledSupply: 0.1,
    trappedSupply: 0.1,
    insiderCoil: 0,
    insiderRealized: 0,
    velocityOfRealization: 0,
    coilScore: 0.3,
    confidence: 0.8,
    shelves: [],
    trapdoorUsd: null,
    ceilingUsd: null,
    method: 'wallet',
    supplyCovered: 0.8,
    structuralFlags: [],
    ...over,
  };
}

function rung(fraction: number, priceUsd: number): LadderRung {
  return { fraction, priceUsd, multipleOnEntry: null, rationale: 'test' };
}

function ladderOf(rungs: LadderRung[], runnerFraction = 0): ExitLadder {
  return {
    rungs,
    runnerFraction,
    hardStopUsd: 0.0008,
    stopQuality: 'volatility',
    stopNote: 'test',
    summary: '',
    execution: null,
  };
}

/** A position worth `usd` at the snapshot's spot, entered at `entryMultiple` below spot. */
function positionWorth(snap: TokenSnapshot, usd: number, entryMultiple = 0.5): UserPosition {
  return { size: usd / snap.priceUsd, entryPriceUsd: snap.priceUsd * entryMultiple };
}

describe('priceImpactFraction', () => {
  it('is negligible for an order that is dust against the pool', () => {
    // $2 into $120k of liquidity: r = 2*2/120000, impact ≈ 0.0033%.
    expect(priceImpactFraction(2, 120_000)).toBeLessThan(0.0001);
  });

  it('grows with size and shrinks with depth', () => {
    expect(priceImpactFraction(10_000, 120_000)).toBeGreaterThan(priceImpactFraction(1_000, 120_000));
    expect(priceImpactFraction(10_000, 1_000_000)).toBeLessThan(priceImpactFraction(10_000, 120_000));
  });

  it('matches the constant-product shortfall r/(1+r) with r = 2S/L', () => {
    const r = (2 * 30_000) / 120_000;
    expect(priceImpactFraction(30_000, 120_000)).toBeCloseTo(r / (1 + r), 12);
  });

  it('never reaches or exceeds 1 for a finite order into a real pool', () => {
    expect(priceImpactFraction(1e9, 120_000)).toBeLessThan(1);
  });

  it('treats missing depth as total loss rather than infinite depth', () => {
    // The dangerous default here would be 0 — an unpriced pool reading as free.
    expect(priceImpactFraction(100, 0)).toBe(1);
    expect(priceImpactFraction(100, Number.NaN)).toBe(1);
  });

  it('is zero for a non-order', () => {
    expect(priceImpactFraction(0, 120_000)).toBe(0);
    expect(priceImpactFraction(-5, 120_000)).toBe(0);
  });
});

describe('minimumEconomicClipUsd', () => {
  it('is about a dollar on Solana and far higher on Ethereum', () => {
    const sol = minimumEconomicClipUsd('solana');
    const eth = minimumEconomicClipUsd('ethereum');
    expect(sol).toBeGreaterThan(0.5);
    expect(sol).toBeLessThan(2);
    // Gas that costs dollars means a sell has to be worth tens of dollars.
    expect(eth).toBeGreaterThan(50);
  });

  it('is exactly the size at which the fixed fee hits the cost ceiling', () => {
    for (const chain of ['solana', 'base', 'ethereum'] as const) {
      const min = minimumEconomicClipUsd(chain);
      const { networkFeeUsd, takerFeePct } = CHAIN_COSTS[chain];
      expect(networkFeeUsd / min + takerFeePct).toBeCloseTo(0.05, 10);
    }
  });
});

describe('singleSellCostPct and workableSizeBand', () => {
  it('is U-shaped: fees dominate at the bottom, impact at the top', () => {
    const c = (n: number) => singleSellCostPct(n, 'solana', 120_000);
    expect(c(1)).toBeGreaterThan(c(100));
    expect(c(100_000)).toBeGreaterThan(c(100));
  });

  it('treats a non-position as a total loss rather than free', () => {
    expect(singleSellCostPct(0, 'solana', 120_000)).toBe(1);
    expect(singleSellCostPct(-1, 'solana', 120_000)).toBe(1);
  });

  it('brackets a band whose ends both sit on the cost threshold', () => {
    const band = workableSizeBand('solana', 120_000)!;
    expect(band).not.toBeNull();
    expect(band.minUsd).toBeLessThan(band.maxUsd);
    expect(singleSellCostPct(band.minUsd, 'solana', 120_000)).toBeCloseTo(0.03, 4);
    expect(singleSellCostPct(band.maxUsd, 'solana', 120_000)).toBeCloseTo(0.03, 4);
  });

  it('holds the whole band under the threshold and neither side outside it', () => {
    const band = workableSizeBand('solana', 120_000)!;
    const inside = [band.minUsd * 1.2, Math.sqrt(band.minUsd * band.maxUsd), band.maxUsd * 0.8];
    for (const n of inside) expect(singleSellCostPct(n, 'solana', 120_000)).toBeLessThan(0.03);
    expect(singleSellCostPct(band.minUsd * 0.7, 'solana', 120_000)).toBeGreaterThan(0.03);
    expect(singleSellCostPct(band.maxUsd * 1.4, 'solana', 120_000)).toBeGreaterThan(0.03);
  });

  it('widens the ceiling with pool depth and lifts the floor with gas', () => {
    const thin = workableSizeBand('solana', 30_000)!;
    const deep = workableSizeBand('solana', 2_000_000)!;
    expect(deep.maxUsd).toBeGreaterThan(thin.maxUsd * 5);

    const eth = workableSizeBand('ethereum', 2_000_000)!;
    // $3.50 of gas puts the floor two orders of magnitude above Solana's.
    expect(eth.minUsd).toBeGreaterThan(deep.minUsd * 50);
  });

  it('returns no band at all when the pool is too thin for any size to work', () => {
    // A pool where the cheapest possible exit still costs more than the bar.
    expect(workableSizeBand('ethereum', 5_000)).toBeNull();
    expect(workableSizeBand('solana', 0)).toBeNull();
  });
});

describe('clipsFor', () => {
  it('fills a small order in one clip', () => {
    expect(clipsFor(50, 120_000)).toBe(1);
  });

  it('slices an order that would move the pool', () => {
    expect(clipsFor(30_000, 120_000)).toBeGreaterThan(1);
  });

  it('caps rather than proposing an unworkable number of orders', () => {
    expect(clipsFor(50_000_000, 120_000)).toBeLessThanOrEqual(20);
  });

  it('produces enough clips that each one clears under the impact ceiling', () => {
    const gross = 8_000;
    const liq = 120_000;
    const n = clipsFor(gross, liq);
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(20);
    expect(priceImpactFraction(gross / n, liq)).toBeLessThanOrEqual(0.02 + 1e-9);
  });

  it('stops guaranteeing anything at the cap, which is the honest answer', () => {
    // Twenty clips of a position five hundred times the pool is not a plan.
    // The cap exists so the number reads as "this does not fit" rather than
    // proposing a thousand orders that would not help either.
    const n = clipsFor(50_000_000, 120_000);
    expect(n).toBe(20);
    expect(priceImpactFraction(50_000_000 / n, 120_000)).toBeGreaterThan(0.02);
  });
});

describe('applyExecutionReality — the small trader', () => {
  const snap = snapshot();

  it('collapses a three-rung ladder to one exit on a $2 position', () => {
    const drafted = ladderOf([rung(0.25, 0.0011), rung(0.35, 0.0014), rung(0.25, 0.002)], 0.15);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 2));

    expect(out.rungs).toHaveLength(1);
    expect(out.execution?.collapsed).toBe(true);
    expect(out.execution?.proposedRungs).toBe(3);
  });

  it('folds the runner in rather than leaving a stake too small to be worth a fee', () => {
    const drafted = ladderOf([rung(0.25, 0.0011), rung(0.35, 0.0014), rung(0.25, 0.002)], 0.15);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 2));

    expect(out.runnerFraction).toBe(0);
    // Nothing is lost in the merge: the whole position is still accounted for.
    const total = out.rungs.reduce((s, r) => s + r.fraction, 0) + out.runnerFraction;
    expect(total).toBeCloseTo(1, 10);
  });

  it('places an ordinary position inside the workable band and says nothing about it', () => {
    const out = applyExecutionReality(
      ladderOf([rung(0.25, 0.0011), rung(0.35, 0.0014), rung(0.25, 0.002)], 0.15),
      snap,
      positionWorth(snap, 300),
    );
    expect(out.execution?.outsideBand).toBe(false);
    expect(out.execution!.note).not.toContain('trade cheaply');
  });

  it('tells a sub-band trader they need a bigger move, not a bigger position', () => {
    const out = applyExecutionReality(
      ladderOf([rung(1, 0.0014)]),
      snap,
      positionWorth(snap, 1),
    );
    expect(out.execution?.outsideBand).toBe(true);
    expect(out.execution!.note).toContain('bigger move');
  });

  it('keeps the full ladder once the position can pay for it', () => {
    const drafted = ladderOf([rung(0.25, 0.0011), rung(0.35, 0.0014), rung(0.25, 0.002)], 0.15);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 5_000));

    expect(out.rungs).toHaveLength(3);
    expect(out.execution?.collapsed).toBe(false);
    // $1.7k rungs into a $120k pool are worth splitting in two, but that is
    // routine advice, not the "your order is the market" headline.
    expect(out.execution?.sizeConstrained).toBe(false);
  });

  it('prices the round trip honestly at small size', () => {
    const drafted = ladderOf([rung(0.25, 0.0011), rung(0.35, 0.0014), rung(0.25, 0.002)], 0.15);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 2));

    // A $2 exit pays one $0.04 fee plus ~1.1% taker — call it 3%, and the same
    // again on the way in. The trade has to make ~6% before it makes anything.
    expect(out.execution!.exitCostPct).toBeGreaterThan(0.02);
    expect(out.execution!.exitCostPct).toBeLessThan(0.06);
    expect(out.execution!.breakevenMultiple).toBeGreaterThan(1.03);
    expect(out.execution!.breakevenMultiple).toBeLessThan(1.15);
  });

  it('amortises the fixed fee as the position grows, up to the point impact takes over', () => {
    const drafted = ladderOf([rung(1, 0.0011)]);
    const at = (usd: number) =>
      applyExecutionReality(drafted, snap, positionWorth(snap, usd)).execution!.exitCostPct;

    // Fee-dominated end: growing helps.
    expect(at(200)).toBeLessThan(at(2));
    // Impact-dominated end: growing hurts. A cost model that missed this would
    // tell a whale their exit was cheap because their fee was a rounding error.
    expect(at(60_000)).toBeGreaterThan(at(200));
  });

  it('merges from the far end, keeping the near target', () => {
    // $2.50 on Solana pays for two sells (min clip ≈ $1.03), so rungs 2 and 3
    // become one and rung 1 survives untouched.
    const drafted = ladderOf([rung(0.3, 0.001), rung(0.4, 0.002), rung(0.3, 0.003)]);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 2.5));

    expect(out.rungs).toHaveLength(2);
    expect(out.rungs[0]!.priceUsd).toBe(0.001);
    // Size-weighted merge of 0.4@0.002 and 0.3@0.003.
    expect(out.rungs[1]!.fraction).toBeCloseTo(0.7, 10);
    expect(out.rungs[1]!.priceUsd).toBeCloseTo((0.4 * 0.002 + 0.3 * 0.003) / 0.7, 12);
  });

  it('never averages an urgent market sell into a limit above spot', () => {
    // The collapse keeps rung one intact, so an EXIT_IMMEDIATELY market rung
    // stays at market no matter how small the position is.
    const snapUrgent = snapshot({ priceUsd: 0.001 });
    const drafted = ladderOf([rung(0.6, 0.001), rung(0.25, 0.003), rung(0.15, 0.006)]);
    const out = applyExecutionReality(drafted, snapUrgent, positionWorth(snapUrgent, 1));

    expect(out.rungs).toHaveLength(1);
    expect(out.rungs[0]!.priceUsd).toBe(0.001);
  });

  it('charges Ethereum gas properly — the same $50 position cannot stage there', () => {
    const eth = snapshot({ chain: 'ethereum' });
    const drafted = ladderOf([rung(0.3, 0.0011), rung(0.4, 0.0014), rung(0.3, 0.002)]);

    const onSol = applyExecutionReality(drafted, snapshot(), positionWorth(snapshot(), 50));
    const onEth = applyExecutionReality(drafted, eth, positionWorth(eth, 50));

    expect(onSol.rungs).toHaveLength(3);
    expect(onEth.rungs).toHaveLength(1);
    expect(onEth.execution!.exitCostPct).toBeGreaterThan(onSol.execution!.exitCostPct);
  });
});

describe('applyExecutionReality — the large trader', () => {
  it('flags a position that is large against the pool', () => {
    const snap = snapshot({ liquidityUsd: 90_000 });
    const drafted = ladderOf([rung(0.4, 0.0011), rung(0.35, 0.0014), rung(0.25, 0.002)]);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 60_000));

    expect(out.execution?.sizeConstrained).toBe(true);
    expect(out.execution!.rungs.some((r) => r.clips > 1)).toBe(true);
    expect(out.execution!.note).toContain('pool liquidity');
    expect(out.execution?.outsideBand).toBe(true);
  });

  it('does not pretend slicing makes the impact go away', () => {
    const snap = snapshot({ liquidityUsd: 90_000 });
    const drafted = ladderOf([rung(1, 0.001)]);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 60_000));

    const r = out.execution!.rungs[0]!;
    expect(r.clips).toBeGreaterThan(1);
    // Impact is still charged on the whole rung, not on one clip.
    expect(r.impactUsd / r.grossUsd).toBeCloseTo(priceImpactFraction(r.grossUsd, 90_000), 10);
  });

  it('reports a breakeven a whale cannot reach when the position dwarfs the pool', () => {
    const snap = snapshot({ liquidityUsd: 50_000 });
    const drafted = ladderOf([rung(1, 0.001)]);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 400_000));

    // Round-tripping a position 8× the pool is not a trade at any price.
    expect(out.execution!.breakevenMultiple).toBeGreaterThan(2);
  });

  it('leaves a large position in a deep pool alone', () => {
    const snap = snapshot({ liquidityUsd: 40_000_000 });
    const drafted = ladderOf([rung(0.36, 0.0011), rung(0.32, 0.0014), rung(0.22, 0.002)], 0.1);
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 60_000));

    expect(out.rungs).toHaveLength(3);
    expect(out.execution?.sizeConstrained).toBe(false);
    expect(out.execution?.collapsed).toBe(false);
    expect(out.execution!.exitCostPct).toBeLessThan(0.02);
  });
});

describe('applyExecutionReality — invariants', () => {
  const snap = snapshot();
  const drafted = ladderOf([rung(0.25, 0.0011), rung(0.35, 0.0014), rung(0.25, 0.002)], 0.15);

  it('returns no execution report without a position', () => {
    expect(applyExecutionReality(drafted, snap, null).execution).toBeNull();
  });

  it('returns no execution report for a nonsense size', () => {
    expect(applyExecutionReality(drafted, snap, { size: 0, entryPriceUsd: 0.0005 }).execution).toBeNull();
    expect(
      applyExecutionReality(drafted, snap, { size: Number.NaN, entryPriceUsd: 0.0005 }).execution,
    ).toBeNull();
  });

  it('conserves the position across every collapse', () => {
    for (const usd of [0.5, 2, 5, 25, 100, 5_000, 250_000]) {
      const out = applyExecutionReality(drafted, snap, positionWorth(snap, usd));
      const total = out.rungs.reduce((s, r) => s + r.fraction, 0) + out.runnerFraction;
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('never proposes more rungs than the structural ladder asked for', () => {
    for (const usd of [0.5, 2, 5, 25, 100, 5_000, 250_000]) {
      const out = applyExecutionReality(drafted, snap, positionWorth(snap, usd));
      expect(out.rungs.length).toBeLessThanOrEqual(3);
      expect(out.rungs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps rungs in ascending price order after merging', () => {
    for (const usd of [0.5, 2, 2.5, 5, 25, 100]) {
      const out = applyExecutionReality(drafted, snap, positionWorth(snap, usd));
      for (let i = 1; i < out.rungs.length; i++) {
        expect(out.rungs[i]!.priceUsd).toBeGreaterThan(out.rungs[i - 1]!.priceUsd);
      }
    }
  });

  it('reports costs that add up to the parts', () => {
    const out = applyExecutionReality(drafted, snap, positionWorth(snap, 5_000));
    for (const r of out.execution!.rungs) {
      expect(r.costUsd).toBeCloseTo(r.networkFeeUsd + r.takerFeeUsd + r.impactUsd, 10);
      expect(r.netUsd).toBeCloseTo(r.grossUsd - r.costUsd, 10);
      expect(r.costPct).toBeCloseTo(r.costUsd / r.grossUsd, 10);
    }
  });

  it('recomputes the merged rung multiple against the trader entry', () => {
    const position = positionWorth(snap, 2);
    const out = applyExecutionReality(drafted, snap, position);
    expect(out.rungs[0]!.multipleOnEntry).toBeCloseTo(
      out.rungs[0]!.priceUsd / position.entryPriceUsd,
      10,
    );
  });
});

describe('buildLadder integration', () => {
  it('hands a $2 trader one exit and a full-size trader three', () => {
    const snap = snapshot();
    const coil = analyzeCoil(snap);

    const tiny = buildLadder(snap, coil, 'ARM_EXIT', positionWorth(snap, 2));
    const big = buildLadder(snap, coil, 'ARM_EXIT', positionWorth(snap, 20_000));

    expect(tiny.rungs.length).toBe(1);
    expect(big.rungs.length).toBeGreaterThan(1);
  });

  it('writes the summary against the collapsed plan, not the draft', () => {
    const snap = snapshot();
    const coil = analyzeCoil(snap);
    const tiny = buildLadder(snap, coil, 'ARM_EXIT', positionWorth(snap, 2));

    // One rung in the plan means at most one "% at" clause in the summary.
    const clauses = tiny.summary.match(/% at /g) ?? [];
    expect(clauses.length).toBeLessThanOrEqual(1);
    expect(tiny.summary).not.toContain('runs');
  });

  it('still produces a ladder with no position, and no execution report', () => {
    const snap = snapshot();
    const ladder = buildLadder(snap, analyzeCoil(snap), 'ARM_EXIT', null);
    expect(ladder.rungs.length).toBeGreaterThan(0);
    expect(ladder.execution).toBeNull();
  });

  it('leaves the structural stop untouched by size', () => {
    const snap = snapshot();
    const coil = coilOf({ trapdoorUsd: 0.0007, coilScore: 0.6 });
    const tiny = buildLadder(snap, coil, 'ARM_EXIT', positionWorth(snap, 2));
    const big = buildLadder(snap, coil, 'ARM_EXIT', positionWorth(snap, 20_000));

    // Structure does not care how much money you have.
    expect(tiny.hardStopUsd).toBe(big.hardStopUsd);
    expect(tiny.stopQuality).toBe(big.stopQuality);
  });
});

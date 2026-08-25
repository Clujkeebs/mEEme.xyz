import { describe, expect, it } from 'vitest';
import { analyzeCoil } from '../coil';
import { atrPercent, buildLadder, resolveHardStop, runnerFraction } from '../ladder';
import { computeHalfLife, decideVerdict, VERDICT_META } from '../verdict';
import { runAlphaEngine } from '../index';
import { holder, NOW, snapshot } from './factory';
import type { CoilReport } from '../types';

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
    structuralFlags: [],
    ...over,
  };
}

describe('atrPercent', () => {
  it('falls back to a default when candles are missing', () => {
    expect(atrPercent(snapshot({ candles: [] }))).toBeCloseTo(0.15, 6);
  });

  it('stays inside sane bounds for a violent chart', () => {
    const wild = snapshot({
      candles: Array.from({ length: 30 }, (_, i) => ({
        timeSec: i * 60, open: 1, high: 100, low: 0.001, close: 1, volumeUsd: 10,
      })),
    });
    const atr = atrPercent(wild);
    expect(atr).toBeLessThanOrEqual(1.5);
    expect(atr).toBeGreaterThan(0);
  });
});

describe('runnerFraction', () => {
  it('gives a full runner only when the coil is empty', () => {
    expect(runnerFraction(0)).toBeCloseTo(0.3, 6);
  });
  it('takes the runner away as coil rises', () => {
    expect(runnerFraction(0.9)).toBeLessThan(0.02);
  });
  it('is monotonically decreasing', () => {
    const pts = [0, 0.2, 0.4, 0.6, 0.8, 1].map(runnerFraction);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!).toBeLessThanOrEqual(pts[i - 1]!);
  });
});

describe('resolveHardStop', () => {
  it('places the stop just under a usable trapdoor', () => {
    // snapshot() candles give ~11% ATR, so a 25%-away shelf is inside the band.
    const stop = resolveHardStop(snapshot({ priceUsd: 0.01 }), coilOf({ trapdoorUsd: 0.0075 }));
    expect(stop.quality).toBe('structural');
    expect(stop.priceUsd).toBeLessThan(0.0075);
    expect(stop.priceUsd).toBeGreaterThan(0.007);
  });

  it('falls back to a volatility stop when no trapdoor exists', () => {
    const stop = resolveHardStop(snapshot({ priceUsd: 0.01 }), coilOf({ trapdoorUsd: null }));
    expect(stop.quality).toBe('volatility');
    expect(stop.priceUsd).toBeLessThan(0.01);
    expect(stop.priceUsd).toBeGreaterThan(0.005);
  });

  it('ignores a trapdoor that is not actually below spot', () => {
    const stop = resolveHardStop(snapshot({ priceUsd: 0.01 }), coilOf({ trapdoorUsd: 0.05 }));
    expect(stop.priceUsd).toBeLessThan(0.01);
    expect(stop.quality).toBe('volatility');
  });

  it('refuses to pretend a shelf inside the noise is a usable stop', () => {
    // Trapdoor 2% below spot, ATR ~11%: any stop there is noise.
    const stop = resolveHardStop(snapshot({ priceUsd: 0.01 }), coilOf({ trapdoorUsd: 0.0102 * 0.98 }));
    expect(stop.quality).toBe('inside-noise');
    expect(stop.note).toMatch(/size down/i);
  });

  it('downgrades a shelf that is too far away to be honoured', () => {
    const stop = resolveHardStop(snapshot({ priceUsd: 0.01 }), coilOf({ trapdoorUsd: 0.002 }));
    expect(stop.quality).toBe('volatility');
    // Volatility band caps the distance rather than handing back an 80% stop.
    expect(stop.priceUsd).toBeGreaterThan(0.005);
  });
});

describe('buildLadder', () => {
  it('allocates the entire position across rungs and runner', () => {
    const snap = snapshot({ priceUsd: 0.01 });
    const ladder = buildLadder(snap, coilOf({ coilScore: 0.4 }), 'HOLD_THROUGH_NOISE', null);
    const total = ladder.rungs.reduce((s, r) => s + r.fraction, 0) + ladder.runnerFraction;
    expect(total).toBeCloseTo(1, 6);
  });

  it('keeps rung prices strictly ascending', () => {
    const ladder = buildLadder(snapshot({ priceUsd: 0.01 }), coilOf({ coilScore: 0.2 }), 'SCALE_IN', null);
    for (let i = 1; i < ladder.rungs.length; i++) {
      expect(ladder.rungs[i]!.priceUsd).toBeGreaterThan(ladder.rungs[i - 1]!.priceUsd);
    }
  });

  it('sells the first rung at market when the verdict is urgent', () => {
    const snap = snapshot({ priceUsd: 0.01 });
    const ladder = buildLadder(snap, coilOf({ coilScore: 0.9 }), 'EXIT_IMMEDIATELY', null);
    expect(ladder.rungs[0]!.priceUsd).toBe(0.01);
    expect(ladder.rungs[0]!.rationale).toMatch(/market/i);
  });

  it('front-loads harder as coil rises', () => {
    const snap = snapshot({ priceUsd: 0.01 });
    const calm = buildLadder(snap, coilOf({ coilScore: 0.1 }), 'SCALE_IN', null);
    const hot = buildLadder(snap, coilOf({ coilScore: 0.75 }), 'SCALE_OUT_NOW', null);
    expect(hot.rungs[0]!.fraction).toBeGreaterThan(calm.rungs[0]!.fraction);
  });

  it('snaps a target onto real overhead supply when one is close', () => {
    const snap = snapshot({ priceUsd: 0.01, candles: [] }); // ATR default 0.15
    // First rung lands near 0.01 * (1 + 0.15*1.5*compression). Put a shelf right there.
    const coil = coilOf({
      coilScore: 0.3,
      shelves: [{ priceUsd: 0.0119, supplyFraction: 0.09, kind: 'trapped', insiderShare: 0 }],
    });
    const ladder = buildLadder(snap, coil, 'HOLD_THROUGH_NOISE', null);
    expect(ladder.rungs[0]!.priceUsd).toBeCloseTo(0.0119, 6);
    expect(ladder.rungs[0]!.rationale).toMatch(/overhead supply/i);
  });

  it('reports the multiple on entry when a position is known', () => {
    const ladder = buildLadder(
      snapshot({ priceUsd: 0.01 }),
      coilOf({ coilScore: 0.4 }),
      'ARM_EXIT',
      { size: 1000, entryPriceUsd: 0.002 },
    );
    expect(ladder.rungs[0]!.multipleOnEntry).toBeGreaterThan(5);
    expect(ladder.summary).toMatch(/5\.00× on entry/);
  });

  it('always states a hard stop with its provenance', () => {
    const ladder = buildLadder(snapshot(), coilOf(), 'HOLD_THROUGH_NOISE', null);
    expect(ladder.hardStopUsd).toBeGreaterThan(0);
    expect(ladder.summary).toMatch(/hard stop/i);
    expect(ladder.stopQuality).toBeTruthy();
    expect(ladder.stopNote.length).toBeGreaterThan(10);
  });

  it('takes size at market when the position has no room for a stop', () => {
    const snap = snapshot({ priceUsd: 0.01 });
    const noRoom = coilOf({ coilScore: 0.3, trapdoorUsd: 0.0099 });
    const ladder = buildLadder(snap, noRoom, 'HOLD_THROUGH_NOISE', null);
    expect(ladder.stopQuality).toBe('inside-noise');
    expect(ladder.rungs[0]!.priceUsd).toBe(0.01);
    expect(ladder.rungs[0]!.rationale).toMatch(/no room/i);
  });
});

describe('decideVerdict', () => {
  it('calls NO_TOUCH on a live mint authority with insiders loaded', () => {
    const snap = snapshot({ mintAuthorityActive: true });
    expect(decideVerdict(snap, coilOf({ insiderCoil: 0.2 }))).toBe('NO_TOUCH');
  });

  it('calls NO_TOUCH when there is effectively no liquidity', () => {
    expect(decideVerdict(snapshot({ liquidityUsd: 800 }), coilOf())).toBe('NO_TOUCH');
  });

  it('calls EXIT_IMMEDIATELY when insiders are actively dumping', () => {
    const v = decideVerdict(
      snapshot(),
      coilOf({ insiderCoil: 0.12, insiderRealized: 0.5, velocityOfRealization: 0.4, coilScore: 0.6 }),
    );
    expect(v).toBe('EXIT_IMMEDIATELY');
  });

  it('calls SCALE_OUT_NOW on a loaded book with turning flow', () => {
    expect(decideVerdict(snapshot(), coilOf({ coilScore: 0.7 }))).toBe('SCALE_OUT_NOW');
  });

  it('calls ARM_EXIT on a building coil', () => {
    expect(decideVerdict(snapshot(), coilOf({ coilScore: 0.55 }))).toBe('ARM_EXIT');
  });

  it('calls HOLD_THROUGH_NOISE in the middle band', () => {
    expect(decideVerdict(snapshot(), coilOf({ coilScore: 0.35 }))).toBe('HOLD_THROUGH_NOISE');
  });

  it('reserves APEX_ENTRY for clean structure, trapped float and accumulation', () => {
    const v = decideVerdict(
      snapshot(),
      coilOf({ coilScore: 0.1, trappedSupply: 0.3, coiledSupply: 0.02, velocityOfRealization: -0.4 }),
    );
    expect(v).toBe('APEX_ENTRY');
  });

  it('will not call APEX_ENTRY when the contract is flagged', () => {
    const v = decideVerdict(
      snapshot(),
      coilOf({
        coilScore: 0.1, trappedSupply: 0.3, coiledSupply: 0.02,
        velocityOfRealization: -0.4, structuralFlags: ['LP not burned'],
      }),
    );
    expect(v).toBe('SCALE_IN');
  });

  it('lets the worst true statement win over the best one', () => {
    // Cheap AND rigged reads as rigged.
    const v = decideVerdict(
      snapshot({ mintAuthorityActive: true }),
      coilOf({ coilScore: 0.05, trappedSupply: 0.4, insiderCoil: 0.3, velocityOfRealization: -0.5 }),
    );
    expect(v).toBe('NO_TOUCH');
  });

  it('has presentation metadata for every verdict it can return', () => {
    for (const key of Object.keys(VERDICT_META)) {
      expect(VERDICT_META[key as keyof typeof VERDICT_META].label.length).toBeGreaterThan(0);
    }
  });
});

describe('computeHalfLife', () => {
  it('expires fast on a brand new token', () => {
    expect(computeHalfLife(snapshot({ ageMinutes: 10 }), coilOf())).toBeLessThanOrEqual(6);
  });
  it('lasts longer on a settled book', () => {
    expect(computeHalfLife(snapshot({ ageMinutes: 5000 }), coilOf())).toBeGreaterThan(20);
  });
  it('shortens when flow is loud', () => {
    const quiet = computeHalfLife(snapshot({ ageMinutes: 5000 }), coilOf({ velocityOfRealization: 0 }));
    const loud = computeHalfLife(snapshot({ ageMinutes: 5000 }), coilOf({ velocityOfRealization: 0.9 }));
    expect(loud).toBeLessThan(quiet);
  });
  it('never returns less than the minimum refresh interval', () => {
    expect(computeHalfLife(snapshot({ ageMinutes: 1 }), coilOf({ velocityOfRealization: 1 }))).toBeGreaterThanOrEqual(3);
  });
});

describe('runAlphaEngine end to end', () => {
  it('produces a complete, self-consistent signal on a rigged token', () => {
    const snap = snapshot({
      symbol: 'RUG',
      priceUsd: 0.01,
      circulatingSupply: 1000,
      mintAuthorityActive: true,
      lpBurnedPct: 0,
      liquidityUsd: 9_000,
      fdvUsd: 8_000_000,
      holders: [
        holder(300, 0.0001, { tags: ['sniper'], realizedFraction: 0.5, lastActivityMs: NOW - 1000 }),
        holder(100, 0.009),
      ],
      txns: {
        m5: { buys: 5, sells: 95 }, h1: { buys: 50, sells: 450 },
        h6: { buys: 300, sells: 800 }, h24: { buys: 800, sells: 1000 },
      },
    });
    const signal = runAlphaEngine(snap);
    expect(signal.verdict).toBe('NO_TOUCH');
    expect(signal.reasoning.length).toBeGreaterThan(2);
    expect(signal.headline).toContain('RUG');
    expect(signal.conviction).toBeGreaterThan(0.5);
  });

  it('reads the book from the trader position when one is supplied', () => {
    const snap = snapshot({
      priceUsd: 0.01,
      circulatingSupply: 1000,
      holders: [holder(200, 0.001), holder(200, 0.05)],
    });
    const signal = runAlphaEngine(snap, { size: 5000, entryPriceUsd: 0.002 });
    expect(signal.ladder).not.toBeNull();
    expect(signal.reasoning.join(' ')).toMatch(/5\.00× on entry/);
    expect(signal.reasoning.join(' ')).toMatch(/held below your cost/);
  });

  it('never emits NaN in any numeric field', () => {
    const signal = runAlphaEngine(snapshot({ holders: [], candles: [], circulatingSupply: 0 }));
    expect(Number.isNaN(signal.coil.coilScore)).toBe(false);
    expect(Number.isNaN(signal.conviction)).toBe(false);
    expect(Number.isNaN(signal.ladder!.hardStopUsd)).toBe(false);
    for (const r of signal.ladder!.rungs) expect(Number.isNaN(r.priceUsd)).toBe(false);
  });

  it('is deterministic — the same snapshot always yields the same call', () => {
    const snap = snapshot({ holders: [holder(300, 0.0005), holder(200, 0.004)] });
    const a = runAlphaEngine(snap);
    const b = runAlphaEngine(snap);
    expect(a.verdict).toBe(b.verdict);
    expect(a.coil.coilScore).toBe(b.coil.coilScore);
    expect(a.ladder!.rungs.map((r) => r.priceUsd)).toEqual(b.ladder!.rungs.map((r) => r.priceUsd));
  });
});

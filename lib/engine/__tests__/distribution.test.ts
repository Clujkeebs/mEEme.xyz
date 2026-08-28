import { describe, expect, it } from 'vitest';
import { fromVolumeProfile, fromWallets, resolveDistribution } from '../distribution';
import { holder, NOW, snapshot } from './factory';
import type { Candle } from '../types';

/** Flat price, constant volume — the simplest possible book. */
function flatCandles(count: number, price: number, volumeUsd: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timeSec: Math.floor(NOW / 1000) - (count - i) * 60,
    open: price,
    high: price,
    low: price,
    close: price,
    volumeUsd,
  }));
}

describe('fromVolumeProfile', () => {
  it('assigns cost basis at the price the volume actually traded at', () => {
    const dist = fromVolumeProfile(flatCandles(30, 0.01, 100), 100_000);
    expect(dist.method).toBe('volume-profile');
    expect(dist.bands).toHaveLength(1);
    expect(dist.bands[0]!.priceUsd).toBeCloseTo(0.01, 6);
  });

  it('never claims more supply than the float contains', () => {
    // Each candle churns 100x the float.
    const dist = fromVolumeProfile(flatCandles(60, 0.01, 1_000_000), 1_000);
    const total = dist.bands.reduce((s, b) => s + b.share, 0);
    expect(total).toBeLessThanOrEqual(1.0001);
    expect(dist.covered).toBeLessThanOrEqual(1);
  });

  it('reports partial coverage when the float has barely turned over', () => {
    // Total volume buys only a tenth of the float across the window.
    const dist = fromVolumeProfile(flatCandles(10, 0.01, 10), 100_000);
    expect(dist.covered).toBeGreaterThan(0);
    expect(dist.covered).toBeLessThan(0.2);
  });

  it('approaches full coverage once the float has turned over several times', () => {
    const float = 10_000;
    // Each candle trades ~10% of the float; 60 candles ≈ 6x turnover.
    const dist = fromVolumeProfile(flatCandles(60, 1, float * 0.1), float);
    expect(dist.covered).toBeGreaterThan(0.9);
  });

  it('weights recent prices far more heavily than old ones', () => {
    const float = 10_000;
    // Decay is driven by *token* turnover, not dollar volume, so both halves
    // are sized to churn the same number of tokens per candle.
    const tokensPerCandle = float * 0.2;
    const old = flatCandles(30, 1, tokensPerCandle * 1).map((c) => ({ ...c, timeSec: c.timeSec - 3600 }));
    const recent = flatCandles(30, 10, tokensPerCandle * 10);
    const dist = fromVolumeProfile([...old, ...recent], float);

    const atTen = dist.bands.filter((b) => b.priceUsd > 5).reduce((s, b) => s + b.share, 0);
    const atOne = dist.bands.filter((b) => b.priceUsd < 5).reduce((s, b) => s + b.share, 0);
    // Supply bought at $1 has been resold many times over since.
    expect(atTen).toBeGreaterThan(atOne);
    expect(atOne).toBeLessThan(0.05);
  });

  it('decays old supply out of the book as turnover accumulates', () => {
    const float = 10_000;
    // Six candles, each churning the entire float once.
    const dist = fromVolumeProfile(
      [
        ...flatCandles(1, 1, float * 1).map((c) => ({ ...c, timeSec: c.timeSec - 7200 })),
        ...flatCandles(6, 5, float * 5),
      ],
      float,
    );
    const stale = dist.bands.filter((b) => b.priceUsd < 2).reduce((s, b) => s + b.share, 0);
    expect(stale).toBeLessThan(0.01);
  });

  it('treats supply acquired recently as being in more urgent hands', () => {
    const dist = fromVolumeProfile(flatCandles(60, 1, 500), 10_000);
    expect(dist.bands[0]!.urgency).toBeGreaterThan(0.5);
    expect(dist.bands[0]!.urgency).toBeLessThanOrEqual(1.75);
  });

  it('refuses to produce anything from too few candles', () => {
    expect(fromVolumeProfile(flatCandles(2, 1, 100), 1000).method).toBe('none');
    expect(fromVolumeProfile([], 1000).bands).toHaveLength(0);
  });

  it('ignores candles with no volume or a nonsensical price', () => {
    const broken: Candle[] = [
      ...flatCandles(10, 0.01, 100),
      { timeSec: Math.floor(NOW / 1000), open: 0, high: 0, low: 0, close: 0, volumeUsd: 5000 },
    ];
    const dist = fromVolumeProfile(broken, 100_000);
    expect(dist.bands.every((b) => Number.isFinite(b.priceUsd) && b.priceUsd > 0)).toBe(true);
  });

  it('produces no NaN for a zero float', () => {
    const dist = fromVolumeProfile(flatCandles(30, 1, 100), 0);
    expect(dist.method).toBe('none');
  });
});

describe('fromWallets', () => {
  it('measures coverage against the float, not the holder count', () => {
    const dist = fromWallets([holder(400, 0.01), holder(100, 0.02)], 1000, NOW, 240);
    expect(dist.covered).toBeCloseTo(0.5, 6);
    expect(dist.method).toBe('wallet');
  });

  it('excludes LP from the distribution entirely', () => {
    const dist = fromWallets([holder(900, 0.01, { tags: ['lp'] }), holder(100, 0.01)], 1000, NOW, 240);
    expect(dist.covered).toBeCloseTo(0.1, 6);
  });

  it('carries real behaviour that a volume profile cannot see', () => {
    const selling = fromWallets(
      [holder(500, 0.01, { realizedFraction: 0.6, lastActivityMs: NOW - 1000 })],
      1000, NOW, 240,
    );
    const idle = fromWallets(
      [holder(500, 0.01, { realizedFraction: 0, lastActivityMs: NOW - 1000 })],
      1000, NOW, 240,
    );
    expect(selling.bands[0]!.realizedShare).toBeCloseTo(0.6, 6);
    expect(selling.bands[0]!.urgency).toBeGreaterThan(idle.bands[0]!.urgency);
  });

  it('skips holders with no reconstructable cost basis', () => {
    const dist = fromWallets([holder(500, null), holder(100, 0.01)], 1000, NOW, 240);
    expect(dist.covered).toBeCloseTo(0.1, 6);
  });
});

describe('resolveDistribution', () => {
  it('prefers wallet data when it actually covers the float', () => {
    const snap = snapshot({
      circulatingSupply: 1000,
      holders: [holder(600, 0.001), holder(200, 0.002)],
    });
    expect(resolveDistribution(snap, 1000).method).toBe('wallet');
  });

  it('falls back to the volume profile when wallet coverage is thin', () => {
    const snap = snapshot({
      circulatingSupply: 1000,
      holders: [holder(20, 0.001)], // 2% coverage
    });
    const method = resolveDistribution(snap, 1000).method;
    expect(['volume-profile', 'hybrid']).toContain(method);
  });

  it('overlays known insider positions onto the profile shape', () => {
    // Thin wallet coverage, but what we have is a flagged insider cluster
    // sitting right where the candles say supply changed hands.
    const price = 0.001;
    const snap = snapshot({
      priceUsd: price,
      circulatingSupply: 1000,
      candles: Array.from({ length: 40 }, (_, i) => ({
        timeSec: Math.floor(NOW / 1000) - (40 - i) * 60,
        open: price, high: price, low: price, close: price, volumeUsd: 200,
      })),
      holders: [holder(50, price, { tags: ['sniper'], realizedFraction: 0.5 })],
    });

    const dist = resolveDistribution(snap, 1000);
    expect(dist.method).toBe('hybrid');
    expect(dist.bands.some((b) => b.insiderShare > 0)).toBe(true);
    expect(dist.bands.some((b) => b.realizedShare > 0)).toBe(true);
  });

  it('does not attach an insider position to a band at a wildly different price', () => {
    const snap = snapshot({
      priceUsd: 1,
      circulatingSupply: 1000,
      candles: Array.from({ length: 40 }, (_, i) => ({
        timeSec: Math.floor(NOW / 1000) - (40 - i) * 60,
        open: 1, high: 1, low: 1, close: 1, volumeUsd: 200,
      })),
      // Insider cost basis three orders of magnitude away from any traded price.
      holders: [holder(50, 0.0001, { tags: ['sniper'] })],
    });
    const dist = resolveDistribution(snap, 1000);
    expect(dist.bands.every((b) => b.insiderShare === 0)).toBe(true);
  });

  it('reports none when there is nothing to reason over', () => {
    const snap = snapshot({ holders: [], candles: [] });
    expect(resolveDistribution(snap, 1000).method).toBe('none');
  });

  it('never emits a band with a non-finite price or share', () => {
    for (const float of [1, 1000, 1e9]) {
      const dist = resolveDistribution(snapshot({ circulatingSupply: float }), float);
      for (const b of dist.bands) {
        expect(Number.isFinite(b.priceUsd)).toBe(true);
        expect(Number.isFinite(b.share)).toBe(true);
        expect(b.share).toBeGreaterThan(0);
        expect(b.insiderShare).toBeGreaterThanOrEqual(0);
        expect(b.insiderShare).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * The regression that matters most.
 *
 * The original design derived cost basis by replaying a token's whole trade
 * history. That is unobtainable for any memecoin with real volume, so on live
 * data every wallet failed the balance-drift check, the distribution came back
 * empty, and the mechanic silently produced nothing — while looking perfect on
 * synthetic data where the history was complete by construction.
 *
 * These tests pin the property that fixed it: the engine must reach the same
 * conclusions from data that can actually be fetched.
 */
describe('degradation to obtainable data', () => {
  const INSIDER = new Set(['deployer', 'sniper', 'bundler', 'insider-cluster']);

  const scenarios = [
    'mEEmeRUG11111111111111111111111111111111111',
    'mEEmeDUMP1111111111111111111111111111111111',
    'mEEmeCHPP1111111111111111111111111111111111',
    'mEEmeAPEX1111111111111111111111111111111111',
  ];

  it('reaches the same verdict from insider-only cost basis as from perfect data', async () => {
    const { buildDemoSnapshot } = await import('@/lib/providers/demo');
    const { runAlphaEngine } = await import('../index');

    for (const address of scenarios) {
      const perfect = buildDemoSnapshot(address, NOW);
      const obtainable = {
        ...perfect,
        // Everything a real deployment can actually get: balances for all,
        // cost basis only for the handful of wallets worth a history request.
        holders: perfect.holders.map((h) =>
          h.tags.some((t) => INSIDER.has(t)) ? h : { ...h, costBasisUsd: null },
        ),
      };

      const a = runAlphaEngine(perfect);
      const b = runAlphaEngine(obtainable);

      expect(b.coil.method).toBe('hybrid');
      expect(b.coil.shelves.length).toBeGreaterThan(0);

      // Threat verdicts must survive losing cost basis: failing to see a rug
      // because the data thinned is the one degradation that is never
      // acceptable.
      const THREAT = new Set(['NO_TOUCH', 'EXIT_IMMEDIATELY', 'SCALE_OUT_NOW', 'ARM_EXIT']);
      if (THREAT.has(a.verdict)) {
        expect(b.verdict).toBe(a.verdict);
      } else {
        // Entry verdicts are allowed to degrade to NO_SIGNAL — needing more
        // evidence to say "buy" than to say "nothing" is the asymmetry that
        // was missing. What is forbidden is the other direction: thinner data
        // must never manufacture an entry call that perfect data did not make.
        const ENTRY = new Set(['APEX_ENTRY', 'SCALE_IN']);
        if (!ENTRY.has(a.verdict)) expect(ENTRY.has(b.verdict)).toBe(false);
        expect(THREAT.has(b.verdict)).toBe(false);
      }
    }
  });

  it('still produces a usable read with no wallet cost basis whatsoever', async () => {
    const { buildDemoSnapshot } = await import('@/lib/providers/demo');
    const { runAlphaEngine } = await import('../index');

    for (const address of scenarios) {
      const snap = buildDemoSnapshot(address, NOW);
      const blind = { ...snap, holders: snap.holders.map((h) => ({ ...h, costBasisUsd: null })) };
      const signal = runAlphaEngine(blind);

      expect(signal.coil.method).toBe('volume-profile');
      expect(signal.coil.shelves.length).toBeGreaterThan(0);
      expect(Number.isFinite(signal.coil.coilScore)).toBe(true);
      // And it must be honest that it is working with less.
      expect(signal.coil.confidence).toBeLessThan(runAlphaEngine(snap).coil.confidence);
    }
  });

  it('prices the highest-impact wallets first when choosing who to fetch', async () => {
    const { selectWalletsToPrice } = await import('@/lib/providers');
    const picked = selectWalletsToPrice(
      [
        holder(10, 0.01, { address: 'small-organic' }),
        holder(1_000_000, 0.01, { address: 'pool', tags: ['lp'] }),
        holder(500, 0.01, { address: 'big-organic' }),
        holder(5, 0.01, { address: 'sniper', tags: ['sniper'] }),
        holder(7, 0.01, { address: 'creator' }),
      ],
      'creator',
      3,
    );
    expect(picked[0]).toBe('creator');
    expect(picked[1]).toBe('sniper');
    expect(picked[2]).toBe('big-organic');
    expect(picked).not.toContain('pool');
  });
});

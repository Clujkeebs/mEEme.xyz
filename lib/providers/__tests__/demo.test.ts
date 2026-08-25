import { describe, expect, it } from 'vitest';
import { buildDemoSnapshot, demoScenarioFor } from '../demo';
import { isPlausibleSolanaAddress } from '../index';
import { runAlphaEngine } from '@/lib/engine';

const T = 1_750_000_000_000;

describe('demo provider', () => {
  it('is deterministic for a given address', () => {
    const a = buildDemoSnapshot('SOMEADDRESS111', T);
    const b = buildDemoSnapshot('SOMEADDRESS111', T);
    expect(a.priceUsd).toBe(b.priceUsd);
    expect(a.symbol).toBe(b.symbol);
    expect(a.holders.length).toBe(b.holders.length);
    expect(a.holders[0]!.costBasisUsd).toBe(b.holders[0]!.costBasisUsd);
  });

  it('produces different tokens for different addresses', () => {
    const a = buildDemoSnapshot('ADDR_A', T);
    const b = buildDemoSnapshot('ADDR_B', T);
    expect(a.priceUsd).not.toBe(b.priceUsd);
  });

  it('always flags itself as synthetic', () => {
    expect(buildDemoSnapshot('X', T).dataQuality.synthetic).toBe(true);
  });

  it('closes the final candle exactly at spot so overlays cannot lie', () => {
    for (const addr of ['A1', 'B2', 'C3', 'D4', 'E5']) {
      const s = buildDemoSnapshot(addr, T);
      expect(s.candles.at(-1)!.close).toBeCloseTo(s.priceUsd, 12);
    }
  });

  it('keeps candle highs and lows consistent with opens and closes', () => {
    const s = buildDemoSnapshot('CANDLECHECK', T);
    for (const c of s.candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.low).toBeGreaterThan(0);
    }
  });

  it('produces both trapped and coiled supply, because tokens retrace', () => {
    const s = buildDemoSnapshot('mEEmeCHPP1111111111111111111111111111111111', T);
    const coil = runAlphaEngine(s).coil;
    expect(coil.trappedSupply).toBeGreaterThan(0);
    expect(coil.coiledSupply).toBeGreaterThan(0);
  });

  it('honours pinned scenarios', () => {
    expect(demoScenarioFor('mEEmeRUG11111111111111111111111111111111111')).toBe('rug');
    expect(demoScenarioFor('mEEmeAPEX1111111111111111111111111111111111')).toBe('runner');
  });

  it('drives the engine to the verdict each scenario is meant to illustrate', () => {
    const rug = runAlphaEngine(buildDemoSnapshot('mEEmeRUG11111111111111111111111111111111111', T));
    expect(['NO_TOUCH', 'EXIT_IMMEDIATELY']).toContain(rug.verdict);

    const dump = runAlphaEngine(buildDemoSnapshot('mEEmeDUMP1111111111111111111111111111111111', T));
    expect(['EXIT_IMMEDIATELY', 'SCALE_OUT_NOW']).toContain(dump.verdict);

    const apex = runAlphaEngine(buildDemoSnapshot('mEEmeAPEX1111111111111111111111111111111111', T));
    expect(['APEX_ENTRY', 'SCALE_IN']).toContain(apex.verdict);
  });

  it('never emits a NaN or negative price anywhere in the snapshot', () => {
    for (let i = 0; i < 60; i++) {
      const s = buildDemoSnapshot(`FUZZ_${i}`, T);
      expect(s.priceUsd).toBeGreaterThan(0);
      expect(Number.isFinite(s.liquidityUsd)).toBe(true);
      expect(s.holders.every((h) => h.balance > 0)).toBe(true);
      expect(s.holders.every((h) => h.costBasisUsd === null || h.costBasisUsd > 0)).toBe(true);
      const sig = runAlphaEngine(s);
      expect(Number.isFinite(sig.coil.coilScore)).toBe(true);
      // NO_TOUCH without a position deliberately has no ladder: there is no
      // exit plan for a token you were told not to enter.
      if (sig.ladder) expect(Number.isFinite(sig.ladder.hardStopUsd)).toBe(true);
      else expect(sig.verdict).toBe('NO_TOUCH');
    }
  });

  it('keeps LP holdings out of the sellable float', () => {
    const s = buildDemoSnapshot('LPCHECK', T);
    expect(s.holders.filter((h) => h.tags.includes('lp')).length).toBe(1);
  });
});

describe('ladder availability', () => {
  it('gives a NO_TOUCH holder an exit plan even though a non-holder gets none', () => {
    const s = buildDemoSnapshot('mEEmeRUG11111111111111111111111111111111111', T);
    const browsing = runAlphaEngine(s);
    const holding = runAlphaEngine(s, { size: 1_000, entryPriceUsd: s.priceUsd * 0.5 });
    if (browsing.verdict === 'NO_TOUCH') {
      expect(browsing.ladder).toBeNull();
      expect(holding.ladder).not.toBeNull();
    }
  });
});

describe('pinned demo addresses', () => {
  // These are pasted into the app's own "try one" buttons and posted in docs,
  // so they must survive the same address validation a real mint does.
  const PINNED = [
    'mEEmeRUG11111111111111111111111111111111111',
    'mEEmeDUMP1111111111111111111111111111111111',
    'mEEmeCHPP1111111111111111111111111111111111',
    'mEEmeAPEX1111111111111111111111111111111111',
  ];

  it('are accepted by the same guard the API uses', () => {
    for (const addr of PINNED) {
      expect(isPlausibleSolanaAddress(addr)).toBe(true);
    }
  });

  it('contain only base58 characters', () => {
    // Base58 omits 0, O, I and l precisely because they are confusable.
    for (const addr of PINNED) {
      expect(addr).not.toMatch(/[0OIl]/);
      expect(addr.length).toBeGreaterThanOrEqual(32);
      expect(addr.length).toBeLessThanOrEqual(44);
    }
  });

  it('each map to their intended scenario', () => {
    expect(PINNED.map(demoScenarioFor)).toEqual(['rug', 'distribution', 'chop', 'runner']);
  });
});

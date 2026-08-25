import { describe, expect, it } from 'vitest';
import {
  analyzeCoil,
  coilWeight,
  shelvesFromBands,
  structuralRisk,
  tradableSupply,
  trapWeight,
  urgency,
  velocityOfRealization,
} from '../coil';
import { fromWallets } from '../distribution';
import { holder, NOW, snapshot } from './factory';

describe('coilWeight', () => {
  it('is zero at or below breakeven', () => {
    expect(coilWeight(1)).toBe(0);
    expect(coilWeight(0.5)).toBe(0);
    expect(coilWeight(0)).toBe(0);
  });

  it('rises monotonically with profit', () => {
    const points = [1.1, 2, 5, 10, 25, 100].map(coilWeight);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!).toBeGreaterThan(points[i - 1]!);
    }
  });

  it('saturates so a 100x is not 10x the threat of a 10x', () => {
    const at10 = coilWeight(10);
    const at100 = coilWeight(100);
    expect(at100 / at10).toBeLessThan(1.3);
    expect(at100).toBeLessThan(1);
  });

  it('handles non-finite input without producing NaN', () => {
    expect(coilWeight(Number.NaN)).toBe(0);
    expect(coilWeight(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('trapWeight', () => {
  it('is zero at or above breakeven', () => {
    expect(trapWeight(1)).toBe(0);
    expect(trapWeight(3)).toBe(0);
  });

  it('makes deeply underwater bags stickier than shallow ones', () => {
    expect(trapWeight(0.1)).toBeGreaterThan(trapWeight(0.9));
  });

  it('is bounded to 1', () => {
    expect(trapWeight(0.0001)).toBeLessThanOrEqual(1);
  });
});

describe('urgency', () => {
  const snap = snapshot({ ageMinutes: 600, fetchedAtMs: NOW });

  it('rates a proven seller above an untouched bag', () => {
    const seller = holder(100, 0.0001, { realizedFraction: 0.5, lastActivityMs: NOW - 1000 });
    const idle = holder(100, 0.0001, { realizedFraction: 0, lastActivityMs: NOW - 1000 });
    expect(urgency(seller, snap)).toBeGreaterThan(urgency(idle, snap));
  });

  it('discounts wallets dormant relative to the token lifetime', () => {
    const active = holder(100, 0.0001, { lastActivityMs: NOW - 1000 });
    const dormant = holder(100, 0.0001, { lastActivityMs: NOW - 600 * 60_000 });
    expect(urgency(dormant, snap)).toBeLessThan(urgency(active, snap));
  });

  it('rates insiders above organic holders, all else equal', () => {
    const insider = holder(100, 0.0001, { tags: ['sniper'], lastActivityMs: NOW - 1000 });
    const organic = holder(100, 0.0001, { lastActivityMs: NOW - 1000 });
    expect(urgency(insider, snap)).toBeGreaterThan(urgency(organic, snap));
  });

  it('stays inside its clamp under absurd input', () => {
    const extreme = holder(100, 0.0001, {
      realizedFraction: 99,
      tags: ['sniper', 'fresh', 'deployer'],
      lastActivityMs: NOW,
    });
    const u = urgency(extreme, snap);
    expect(u).toBeLessThanOrEqual(1.75);
    expect(u).toBeGreaterThanOrEqual(0.25);
  });
});

describe('tradableSupply', () => {
  it('excludes LP holdings from the sellable float', () => {
    const snap = snapshot({
      circulatingSupply: 1000,
      holders: [holder(400, null, { tags: ['lp'] }), holder(600, 0.001)],
    });
    expect(tradableSupply(snap)).toBe(600);
  });

  it('falls back to circulating supply if LP would zero the float', () => {
    const snap = snapshot({
      circulatingSupply: 1000,
      holders: [holder(1000, null, { tags: ['lp'] })],
    });
    expect(tradableSupply(snap)).toBe(1000);
  });
});

describe('shelves from wallet distribution', () => {
  const shelvesFor = (snap: ReturnType<typeof snapshot>, spot: number) =>
    shelvesFromBands(fromWallets(snap.holders, 1000, NOW, snap.ageMinutes).bands, spot);

  it('groups nearby cost bases into a single shelf', () => {
    const snap = snapshot({
      circulatingSupply: 1000,
      priceUsd: 0.01,
      holders: [holder(100, 0.001), holder(100, 0.00105), holder(100, 0.00102)],
    });
    const shelves = shelvesFor(snap, 0.01);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]!.supplyFraction).toBeCloseTo(0.3, 5);
    expect(shelves[0]!.kind).toBe('coiled');
  });

  it('labels shelves above spot as trapped', () => {
    const snap = snapshot({ circulatingSupply: 1000, priceUsd: 0.001, holders: [holder(300, 0.01)] });
    expect(shelvesFor(snap, 0.001)[0]!.kind).toBe('trapped');
  });

  it('drops bands below the noise threshold', () => {
    const snap = snapshot({ circulatingSupply: 1_000_000, holders: [holder(100, 0.001)] });
    expect(shelvesFromBands(fromWallets(snap.holders, 1_000_000, NOW, 240).bands, 0.01)).toHaveLength(0);
  });

  it('reports the insider share of each shelf', () => {
    const snap = snapshot({
      circulatingSupply: 1000,
      priceUsd: 0.01,
      holders: [holder(100, 0.001, { tags: ['sniper'] }), holder(100, 0.001)],
    });
    expect(shelvesFor(snap, 0.01)[0]!.insiderShare).toBeCloseTo(0.5, 5);
  });

  it('returns nothing when no holder has a resolved cost basis', () => {
    const snap = snapshot({ holders: [holder(500, null)] });
    expect(shelvesFor(snap, 0.01)).toHaveLength(0);
  });

  it('never counts LP holdings as supply that can be sold', () => {
    const snap = snapshot({
      circulatingSupply: 1000,
      holders: [holder(500, 0.0001, { tags: ['lp'] }), holder(100, 0.001)],
    });
    const dist = fromWallets(snap.holders, 500, NOW, 240);
    expect(dist.bands.reduce((s, b) => s + b.share, 0)).toBeCloseTo(0.2, 5);
  });
});

describe('velocityOfRealization', () => {
  it('is positive when sells dominate', () => {
    const snap = snapshot({
      txns: {
        m5: { buys: 10, sells: 90 },
        h1: { buys: 100, sells: 400 },
        h6: { buys: 500, sells: 900 },
        h24: { buys: 1000, sells: 1200 },
      },
    });
    expect(velocityOfRealization(snap)).toBeGreaterThan(0.3);
  });

  it('is negative when buys dominate', () => {
    const snap = snapshot({
      txns: {
        m5: { buys: 90, sells: 10 },
        h1: { buys: 400, sells: 100 },
        h6: { buys: 900, sells: 500 },
        h24: { buys: 1200, sells: 1000 },
      },
    });
    expect(velocityOfRealization(snap)).toBeLessThan(-0.3);
  });

  it('amplifies distribution when volume is accelerating', () => {
    const flow = {
      m5: { buys: 20, sells: 80 },
      h1: { buys: 200, sells: 800 },
      h6: { buys: 600, sells: 900 },
      h24: { buys: 1000, sells: 1100 },
    };
    const calm = velocityOfRealization(
      snapshot({ txns: flow, volumeUsd: { m5: 1_000, h1: 60_000, h6: 200_000, h24: 500_000 } }),
    );
    const spiking = velocityOfRealization(
      snapshot({ txns: flow, volumeUsd: { m5: 30_000, h1: 60_000, h6: 200_000, h24: 500_000 } }),
    );
    expect(spiking).toBeGreaterThan(calm);
  });

  it('stays in [-1, 1] and never returns NaN on empty flow', () => {
    const snap = snapshot({
      txns: {
        m5: { buys: 0, sells: 0 },
        h1: { buys: 0, sells: 0 },
        h6: { buys: 0, sells: 0 },
        h24: { buys: 0, sells: 0 },
      },
      volumeUsd: { m5: 0, h1: 0, h6: 0, h24: 0 },
    });
    const v = velocityOfRealization(snap);
    expect(Number.isNaN(v)).toBe(false);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('structuralRisk', () => {
  it('finds nothing wrong with a clean token', () => {
    const { risk, flags } = structuralRisk(snapshot());
    expect(flags).toHaveLength(0);
    expect(risk).toBe(0);
  });

  it('flags live mint authority', () => {
    const { risk, flags } = structuralRisk(snapshot({ mintAuthorityActive: true }));
    expect(flags.join(' ')).toMatch(/mint authority/i);
    expect(risk).toBeGreaterThan(0.3);
  });

  it('flags thin liquidity relative to FDV', () => {
    const { flags } = structuralRisk(snapshot({ liquidityUsd: 5_000, fdvUsd: 10_000_000 }));
    expect(flags.join(' ')).toMatch(/liquidity/i);
  });

  it('caps risk at 1 even when everything is wrong', () => {
    const { risk } = structuralRisk(
      snapshot({
        mintAuthorityActive: true,
        freezeAuthorityActive: true,
        lpBurnedPct: 0,
        liquidityUsd: 100,
        fdvUsd: 50_000_000,
        holderCount: 12,
      }),
    );
    expect(risk).toBe(1);
  });
});

describe('analyzeCoil', () => {
  it('reads heavy insider profit as high coil', () => {
    const snap = snapshot({
      priceUsd: 0.01,
      circulatingSupply: 1000,
      holders: [
        holder(200, 0.0001, { tags: ['sniper'], realizedFraction: 0.4, lastActivityMs: NOW - 1000 }),
        holder(150, 0.0002, { tags: ['insider-cluster'], realizedFraction: 0.3, lastActivityMs: NOW - 1000 }),
        holder(100, 0.005),
      ],
      txns: {
        m5: { buys: 10, sells: 90 },
        h1: { buys: 100, sells: 500 },
        h6: { buys: 400, sells: 900 },
        h24: { buys: 900, sells: 1100 },
      },
    });
    const coil = analyzeCoil(snap);
    expect(coil.insiderCoil).toBeCloseTo(0.35, 2);
    expect(coil.insiderRealized).toBeGreaterThan(0.3);
    expect(coil.coilScore).toBeGreaterThan(0.6);
  });

  it('reads an underwater book as low coil with real support', () => {
    const snap = snapshot({
      priceUsd: 0.001,
      circulatingSupply: 1000,
      holders: [holder(300, 0.01), holder(300, 0.005), holder(100, 0.0009)],
      txns: {
        m5: { buys: 80, sells: 20 },
        h1: { buys: 400, sells: 150 },
        h6: { buys: 900, sells: 500 },
        h24: { buys: 1200, sells: 900 },
      },
    });
    const coil = analyzeCoil(snap);
    expect(coil.trappedSupply).toBeGreaterThan(coil.coiledSupply);
    expect(coil.velocityOfRealization).toBeLessThan(0);
    expect(coil.coilScore).toBeLessThan(0.3);
  });

  it('never counts LP holdings as sellers', () => {
    const withLp = analyzeCoil(
      snapshot({
        priceUsd: 0.01,
        circulatingSupply: 1000,
        holders: [holder(500, 0.0001, { tags: ['lp'] }), holder(100, 0.0001)],
      }),
    );
    expect(withLp.coiledSupply).toBeLessThanOrEqual(1);
    // The LP's 50x paper gain must not appear as pressure.
    expect(withLp.insiderCoil).toBe(0);
  });

  it('never lets total supply shares exceed the float, however hot the volume', () => {
    // Volume here churns thousands of times the float every minute. Those are
    // the same coins recirculating, not new supply.
    const churning = analyzeCoil(
      snapshot({
        priceUsd: 0.001,
        circulatingSupply: 500,
        holders: [],
        volumeUsd: { m5: 1e9, h1: 1e10, h6: 1e11, h24: 1e12 },
      }),
    );
    const totalShare = churning.shelves.reduce((s, shelf) => s + shelf.supplyFraction, 0);
    expect(totalShare).toBeLessThanOrEqual(1.0001);
    expect(churning.coiledSupply).toBeLessThanOrEqual(1);
    expect(churning.trappedSupply).toBeLessThanOrEqual(1);
    expect(churning.supplyCovered).toBeLessThanOrEqual(1);
  });

  it('degrades confidence when supply coverage is thin', () => {
    const thin = analyzeCoil(
      snapshot({
        dataQuality: {
          holdersResolved: 4,
          holdersUnresolved: 300,
          supplyCovered: 0.05,
          clusterAnalysisRan: false,
          sources: ['partial'],
          synthetic: false,
        },
      }),
    );
    expect(thin.confidence).toBeLessThan(0.35);
  });

  it('produces a trapdoor below spot and a ceiling above it', () => {
    const snap = snapshot({
      priceUsd: 0.005,
      circulatingSupply: 1000,
      holders: [holder(200, 0.002), holder(250, 0.02)],
    });
    const coil = analyzeCoil(snap);
    expect(coil.trapdoorUsd).not.toBeNull();
    expect(coil.trapdoorUsd!).toBeLessThan(0.005);
    expect(coil.ceilingUsd).not.toBeNull();
    expect(coil.ceilingUsd!).toBeGreaterThan(0.005);
  });

  it('still produces a distribution with no holder data at all', () => {
    // This is the whole point of the volume-profile path: full trade history is
    // unobtainable for a real memecoin, so the engine must not go blind when
    // per-wallet reconstruction returns nothing.
    const coil = analyzeCoil(snapshot({ holders: [] }));
    expect(Number.isNaN(coil.coilScore)).toBe(false);
    expect(coil.method).toBe('volume-profile');
    expect(coil.shelves.length).toBeGreaterThan(0);
  });

  it('goes quiet rather than guessing when it has neither holders nor candles', () => {
    const coil = analyzeCoil(snapshot({ holders: [], candles: [] }));
    expect(coil.method).toBe('none');
    expect(coil.shelves).toHaveLength(0);
    expect(coil.trapdoorUsd).toBeNull();
    expect(coil.confidence).toBeLessThan(0.1);
  });

  it('keeps coilScore inside [0,1] under adversarial input', () => {
    const coil = analyzeCoil(
      snapshot({
        priceUsd: 1_000_000,
        circulatingSupply: 1000,
        mintAuthorityActive: true,
        freezeAuthorityActive: true,
        lpBurnedPct: 0,
        liquidityUsd: 1,
        holders: Array.from({ length: 50 }, () => holder(20, 1e-12, { tags: ['sniper'] })),
      }),
    );
    expect(coil.coilScore).toBeGreaterThanOrEqual(0);
    expect(coil.coilScore).toBeLessThanOrEqual(1);
  });
});

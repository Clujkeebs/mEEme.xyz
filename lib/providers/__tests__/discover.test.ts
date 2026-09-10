import { describe, expect, it } from 'vitest';
import {
  SCAN_MAX_LIQUIDITY_USD,
  SCAN_MIN_LIQUIDITY_USD,
  SCAN_LOW_TURNOVER,
  SCAN_MIN_VOLUME_H24_USD,
} from '../discover';
import { SCAN_WALLET_BUDGET, selectWalletsToPrice } from '../index';
import { fromVolumeProfile } from '@/lib/engine/distribution';
import { computeConfidence } from '@/lib/engine/coil';
import { snapshot } from '@/lib/engine/__tests__/factory';
import { TRACK_RECORD_CONFIDENCE_FLOOR } from '@/lib/signal-store';
import type { Candle } from '@/lib/engine/types';

/**
 * These pin a bug found only in production.
 *
 * Searching DexScreener for "SOL" matches the quote side of essentially every
 * Solana pair, including the SOL pools themselves. Ranking candidates by churn
 * then put wrapped SOL — $1.6B liquidity — at the top, and the first live scan
 * spent three of its twelve slots on it. The engine has nothing to say about a
 * major: its float is not held by a deployer-linked cluster, and there is no
 * trapdoor under SOL.
 */
describe('scan qualification bounds', () => {
  it('brackets liquidity on both sides', () => {
    // A floor alone lets a $1.6B asset through, which is what happened.
    expect(SCAN_MIN_LIQUIDITY_USD).toBeGreaterThan(0);
    expect(SCAN_MAX_LIQUIDITY_USD).toBeGreaterThan(SCAN_MIN_LIQUIDITY_USD);
    expect(SCAN_MAX_LIQUIDITY_USD).toBeLessThan(1_000_000_000);
  });

  it('sets a volume floor so dust cannot enter the ledger', () => {
    expect(SCAN_MIN_VOLUME_H24_USD).toBeGreaterThan(0);
  });

  it('would have rejected the wrapped-SOL pools the first live scan picked up', () => {
    const observedInProduction = [1_632_045_891, 1_627_150_155, 1_597_170_126];
    for (const liquidity of observedInProduction) {
      expect(liquidity).toBeGreaterThan(SCAN_MAX_LIQUIDITY_USD);
    }
  });

  it('still admits the memecoins the same scan found', () => {
    // Real liquidity values from that scan: three, Martians, BOGE, Clussy, PRIAPUS.
    const memecoins = [298_077, 183_772, 89_396, 65_970, 43_152];
    for (const liquidity of memecoins) {
      expect(liquidity).toBeGreaterThanOrEqual(SCAN_MIN_LIQUIDITY_USD);
      expect(liquidity).toBeLessThanOrEqual(SCAN_MAX_LIQUIDITY_USD);
    }
  });
});

/**
 * Why turnover is only ever counted, never used to reject.
 *
 * This started as a filter. The reasoning was sound — the distribution is built
 * from volume, so turnover bounds how much of the float can be described — and
 * the number was still wrong, because the turnover needed to describe a token
 * depends on how far its price has run. These pin that, so the filter does not
 * get reintroduced by someone repeating the same reasoning.
 */
describe('turnover as an observation', () => {
  const FLOAT = 1_000_000_000;

  /** A window of candles worth `turnover x mcap` in total, over a price that ran `run`x. */
  function confidenceAt(turnover: number, run: number, count = 69): number {
    const mcap = 30_000_000;
    const endPrice = mcap / FLOAT;
    const candles: Candle[] = Array.from({ length: count }, (_, i) => {
      const price = (endPrice / run) * Math.pow(run, i / Math.max(1, count - 1));
      return {
        timeSec: 1_700_000_000 + i * 300,
        open: price,
        high: price,
        low: price,
        close: price,
        volumeUsd: (turnover * mcap) / count,
      };
    });
    const dist = fromVolumeProfile(candles, FLOAT);
    return computeConfidence(snapshot({ candles, circulatingSupply: FLOAT, holders: [] }), dist);
  }

  /** Lowest turnover at which a token that has run `run`x can clear the floor. */
  function crossover(run: number): number {
    let lo = 0.0001;
    let hi = 5;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (confidenceAt(mid, run) >= TRACK_RECORD_CONFIDENCE_FLOOR) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  it('needs less turnover the further the price has run', () => {
    // The same dollars buy more of the float at a lower price, so a vertical
    // runner is describable on a fraction of the volume a flat token needs.
    const runs = [2, 5, 20, 100, 1000];
    const crossings = runs.map(crossover);
    for (let i = 1; i < crossings.length; i++) {
      expect(crossings[i]!).toBeLessThan(crossings[i - 1]!);
    }
  });

  it('would discard callable vertical runners if used as a bound', () => {
    // This is the whole reason it is not one. At the level that looks safe from
    // the flat case, a token that has run 100x is already callable.
    expect(crossover(1000)).toBeLessThan(SCAN_LOW_TURNOVER);
    expect(crossover(100)).toBeLessThan(SCAN_LOW_TURNOVER);
    expect(confidenceAt(SCAN_LOW_TURNOVER / 2, 100)).toBeGreaterThanOrEqual(
      TRACK_RECORD_CONFIDENCE_FLOOR,
    );
  });

  it('still explains the production read that could not be described', () => {
    // 1e9 supply, $428k across 69 candles, ~$30M market cap, no big run.
    const turnover = 428_008 / 30_000_000;
    expect(turnover).toBeLessThan(SCAN_LOW_TURNOVER);
    for (const run of [2, 5, 20]) {
      expect(confidenceAt(turnover, run)).toBeLessThan(TRACK_RECORD_CONFIDENCE_FLOOR);
    }
  });
});

/**
 * The scan's Helius budget. Twelve speculative tokens at the full per-token
 * budget was 360 wallet-history calls every thirty minutes, which production
 * showed exhausting the quota — and an exhausted quota costs every read its
 * wallet data, not just the scan's.
 */
describe('scan wallet budget', () => {
  const holders = Array.from({ length: 40 }, (_, i) => ({
    address: `W${i}`,
    balance: 1_000 - i,
    costBasisUsd: null,
    realizedFraction: 0,
    lastActivityMs: 0,
    tags: i === 3 ? ['sniper'] : [],
  }));

  it('spends far less per speculative token than a real read does', () => {
    expect(SCAN_WALLET_BUDGET).toBeGreaterThan(0);
    expect(SCAN_WALLET_BUDGET).toBeLessThan(30);
    // A whole pass has to fit inside a free tier, so the ceiling matters.
    expect(SCAN_WALLET_BUDGET * 12).toBeLessThan(120);
  });

  it('still spends it on the wallets that decide the answer', () => {
    const picked = selectWalletsToPrice(holders, 'W7', SCAN_WALLET_BUDGET);
    expect(picked).toHaveLength(SCAN_WALLET_BUDGET);
    // Deployer first, then the flagged sniper: a smaller budget must not mean a
    // budget spent on whoever happened to be biggest.
    expect(picked[0]).toBe('W7');
    expect(picked).toContain('W3');
  });

  it('leaves a real read at the full budget', () => {
    expect(selectWalletsToPrice(holders, 'W7')).toHaveLength(30);
  });
});

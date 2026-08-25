import { describe, expect, it } from 'vitest';
import { SCAN_MAX_LIQUIDITY_USD, SCAN_MIN_LIQUIDITY_USD, SCAN_MIN_VOLUME_H24_USD } from '../discover';

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

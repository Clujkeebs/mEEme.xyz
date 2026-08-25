import { describe, expect, it } from 'vitest';
import { reconstructHolders, summarizeCoverage, type ClusterInput, type TradeEvent } from '../cluster';
import { NOW } from './factory';

const LAUNCH = NOW - 3 * 60 * 60_000;

function baseInput(over: Partial<ClusterInput> = {}): ClusterInput {
  return {
    trades: [],
    fundingEdges: [],
    deployer: null,
    launchSlot: 1000,
    launchTimeMs: LAUNCH,
    currentBalances: new Map(),
    lpAccounts: new Set(),
    exchangeAccounts: new Set(),
    ...over,
  };
}

const buy = (wallet: string, tokens: number, usd: number, tMs: number, slot?: number): TradeEvent => ({
  wallet, side: 'buy', tokenAmount: tokens, usdValue: usd, timestampMs: tMs, slot,
});
const sell = (wallet: string, tokens: number, usd: number, tMs: number): TradeEvent => ({
  wallet, side: 'sell', tokenAmount: tokens, usdValue: usd, timestampMs: tMs,
});

describe('cost basis reconstruction', () => {
  it('computes a volume-weighted average cost across multiple buys', () => {
    const holders = reconstructHolders(
      baseInput({
        trades: [buy('alice', 100, 100, LAUNCH + 1000), buy('alice', 100, 300, LAUNCH + 2000)],
        currentBalances: new Map([['alice', 200]]),
      }),
    );
    // 400 USD for 200 tokens = 2.00 average
    expect(holders[0]!.costBasisUsd).toBeCloseTo(2, 6);
  });

  it('tracks realized fraction against peak balance', () => {
    const holders = reconstructHolders(
      baseInput({
        trades: [buy('bob', 1000, 1000, LAUNCH + 1000), sell('bob', 400, 800, LAUNCH + 5000)],
        currentBalances: new Map([['bob', 600]]),
      }),
    );
    expect(holders[0]!.realizedFraction).toBeCloseTo(0.4, 6);
  });

  it('refuses a cost basis when trade history cannot explain the balance', () => {
    // We only saw a 100-token buy, but the wallet holds 10,000. History is truncated.
    const holders = reconstructHolders(
      baseInput({
        trades: [buy('carol', 100, 100, LAUNCH + 1000)],
        currentBalances: new Map([['carol', 10_000]]),
      }),
    );
    expect(holders[0]!.costBasisUsd).toBeNull();
  });

  it('accepts a cost basis when drift is within tolerance', () => {
    const holders = reconstructHolders(
      baseInput({
        trades: [buy('dave', 1000, 500, LAUNCH + 1000)],
        currentBalances: new Map([['dave', 1100]]), // 10% drift
      }),
    );
    expect(holders[0]!.costBasisUsd).toBeCloseTo(0.5, 6);
  });

  it('omits wallets that no longer hold anything', () => {
    const holders = reconstructHolders(
      baseInput({
        trades: [buy('exited', 100, 100, LAUNCH + 1000), sell('exited', 100, 900, LAUNCH + 9000)],
        currentBalances: new Map([['exited', 0], ['held', 50]]),
      }),
    );
    expect(holders.map((h) => h.address)).toEqual(['held']);
  });
});

describe('sniper and insider tagging', () => {
  it('tags same-slot launch buys as snipers', () => {
    const holders = reconstructHolders(
      baseInput({
        trades: [buy('sniper1', 100, 10, LAUNCH + 400, 1001), buy('late', 100, 90, LAUNCH + 9_000_000, 90_000)],
        currentBalances: new Map([['sniper1', 100], ['late', 100]]),
      }),
    );
    const s = holders.find((h) => h.address === 'sniper1')!;
    const l = holders.find((h) => h.address === 'late')!;
    expect(s.tags).toContain('sniper');
    expect(l.tags).not.toContain('sniper');
  });

  it('tags snipers by time when slot data is unavailable', () => {
    const holders = reconstructHolders(
      baseInput({
        launchSlot: null,
        trades: [buy('fast', 100, 10, LAUNCH + 5_000), buy('slow', 100, 50, LAUNCH + 600_000)],
        currentBalances: new Map([['fast', 100], ['slow', 100]]),
      }),
    );
    expect(holders.find((h) => h.address === 'fast')!.tags).toContain('sniper');
    expect(holders.find((h) => h.address === 'slow')!.tags).not.toContain('sniper');
  });

  it('links wallets to the deployer by following the gas', () => {
    const holders = reconstructHolders(
      baseInput({
        deployer: 'dep',
        fundingEdges: [{ from: 'dep', to: 'mule', timestampMs: LAUNCH - 60_000, amountNative: 2 }],
        trades: [buy('mule', 100, 10, LAUNCH + 200_000)],
        currentBalances: new Map([['mule', 100], ['dep', 5]]),
      }),
    );
    expect(holders.find((h) => h.address === 'mule')!.tags).toContain('insider-cluster');
    expect(holders.find((h) => h.address === 'dep')!.tags).toContain('deployer');
  });

  it('detects a co-funded ring: same funder, same amount, same window', () => {
    const t = LAUNCH - 300_000;
    const holders = reconstructHolders(
      baseInput({
        fundingEdges: [
          { from: 'funder', to: 'm1', timestampMs: t, amountNative: 1.0 },
          { from: 'funder', to: 'm2', timestampMs: t + 30_000, amountNative: 1.01 },
          { from: 'funder', to: 'm3', timestampMs: t + 60_000, amountNative: 0.995 },
        ],
        trades: [buy('m1', 10, 1, LAUNCH + 5_000_000), buy('m2', 10, 1, LAUNCH + 5_000_000), buy('m3', 10, 1, LAUNCH + 5_000_000)],
        currentBalances: new Map([['m1', 10], ['m2', 10], ['m3', 10]]),
      }),
    );
    for (const h of holders) expect(h.tags).toContain('bundler');
  });

  it('does not call three unrelated amounts a ring', () => {
    const t = LAUNCH - 300_000;
    const holders = reconstructHolders(
      baseInput({
        fundingEdges: [
          { from: 'funder', to: 'a', timestampMs: t, amountNative: 1 },
          { from: 'funder', to: 'b', timestampMs: t + 30_000, amountNative: 17 },
          { from: 'funder', to: 'c', timestampMs: t + 60_000, amountNative: 240 },
        ],
        currentBalances: new Map([['a', 10], ['b', 10], ['c', 10]]),
      }),
    );
    for (const h of holders) expect(h.tags).not.toContain('bundler');
  });

  it('does not treat a CEX hot wallet as the hub of a conspiracy', () => {
    const t = LAUNCH - 300_000;
    const holders = reconstructHolders(
      baseInput({
        exchangeAccounts: new Set(['cex']),
        fundingEdges: [
          { from: 'cex', to: 'u1', timestampMs: t, amountNative: 1 },
          { from: 'cex', to: 'u2', timestampMs: t + 1000, amountNative: 1 },
          { from: 'cex', to: 'u3', timestampMs: t + 2000, amountNative: 1 },
        ],
        trades: [buy('u1', 10, 1, LAUNCH + 400, 1001), buy('u2', 10, 1, LAUNCH + 400, 1001)],
        currentBalances: new Map([['u1', 10], ['u2', 10], ['u3', 10]]),
      }),
    );
    for (const h of holders) {
      expect(h.tags).not.toContain('bundler');
      expect(h.tags).not.toContain('insider-cluster');
    }
  });

  it('promotes a funding component holding multiple snipers', () => {
    const holders = reconstructHolders(
      baseInput({
        fundingEdges: [
          { from: 'src', to: 's1', timestampMs: LAUNCH - 10_000, amountNative: 3 },
          { from: 'src', to: 's2', timestampMs: LAUNCH - 9_000, amountNative: 8 },
        ],
        trades: [buy('s1', 10, 1, LAUNCH + 500, 1001), buy('s2', 10, 1, LAUNCH + 600, 1001)],
        currentBalances: new Map([['s1', 10], ['s2', 10]]),
      }),
    );
    for (const h of holders) expect(h.tags).toContain('insider-cluster');
  });

  it('tags freshly funded wallets', () => {
    const holders = reconstructHolders(
      baseInput({
        walletCreationMs: new Map([['fresh1', LAUNCH + 100_000]]),
        trades: [buy('fresh1', 10, 1, LAUNCH + 200_000)],
        currentBalances: new Map([['fresh1', 10]]),
      }),
    );
    expect(holders[0]!.tags).toContain('fresh');
  });

  it('marks LP and exchange accounts without calling them insiders', () => {
    const holders = reconstructHolders(
      baseInput({
        lpAccounts: new Set(['pool']),
        exchangeAccounts: new Set(['cex']),
        currentBalances: new Map([['pool', 500], ['cex', 200]]),
      }),
    );
    expect(holders.find((h) => h.address === 'pool')!.tags).toContain('lp');
    expect(holders.find((h) => h.address === 'cex')!.tags).toContain('exchange');
  });
});

describe('summarizeCoverage', () => {
  it('measures resolved supply excluding LP', () => {
    const cov = summarizeCoverage(
      [
        { address: 'a', balance: 400, costBasisUsd: 0.01, firstSeenMs: 0, lastActivityMs: 0, realizedFraction: 0, tags: [] },
        { address: 'b', balance: 100, costBasisUsd: null, firstSeenMs: 0, lastActivityMs: 0, realizedFraction: 0, tags: [] },
        { address: 'lp', balance: 500, costBasisUsd: null, firstSeenMs: 0, lastActivityMs: 0, realizedFraction: 0, tags: ['lp'] },
      ],
      1000,
    );
    expect(cov.holdersResolved).toBe(1);
    expect(cov.holdersUnresolved).toBe(1);
    expect(cov.supplyCovered).toBeCloseTo(0.4, 6);
  });

  it('does not divide by zero on an empty book', () => {
    expect(summarizeCoverage([], 0).supplyCovered).toBe(0);
  });
});

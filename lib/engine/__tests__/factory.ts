import type { Candle, HolderPosition, HolderTag, TokenSnapshot } from '../types';

export const NOW = 1_750_000_000_000;

export function holder(
  balance: number,
  costBasisUsd: number | null,
  opts: Partial<Omit<HolderPosition, 'balance' | 'costBasisUsd'>> = {},
): HolderPosition {
  return {
    address: opts.address ?? `w${Math.random().toString(36).slice(2, 10)}`,
    balance,
    costBasisUsd,
    firstSeenMs: opts.firstSeenMs ?? NOW - 60 * 60_000,
    lastActivityMs: opts.lastActivityMs ?? NOW - 60_000,
    realizedFraction: opts.realizedFraction ?? 0,
    tags: opts.tags ?? ([] as HolderTag[]),
  };
}

export function candles(count = 40, base = 0.001): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = base * (1 + 0.02 * Math.sin(i / 3));
    out.push({
      timeSec: Math.floor(NOW / 1000) - (count - i) * 60,
      open: close * 0.99,
      high: close * 1.06,
      low: close * 0.95,
      close,
      volumeUsd: 5_000,
    });
  }
  return out;
}

export function snapshot(overrides: Partial<TokenSnapshot> = {}): TokenSnapshot {
  const base: TokenSnapshot = {
    address: 'TESTMINT1111111111111111111111111111111111',
    chain: 'solana',
    symbol: 'TEST',
    name: 'Test Token',
    priceUsd: 0.001,
    liquidityUsd: 120_000,
    fdvUsd: 1_000_000,
    circulatingSupply: 1_000_000_000,
    ageMinutes: 240,
    volumeUsd: { m5: 8_000, h1: 90_000, h6: 400_000, h24: 900_000 },
    priceChangePct: { m5: 1.2, h1: 8, h6: 30, h24: 120 },
    txns: {
      m5: { buys: 40, sells: 38 },
      h1: { buys: 400, sells: 380 },
      h6: { buys: 1800, sells: 1700 },
      h24: { buys: 5000, sells: 4800 },
    },
    holders: [],
    holderCount: 1200,
    lpBurnedPct: 1,
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    candles: candles(),
    dataQuality: {
      holdersResolved: 100,
      holdersUnresolved: 5,
      supplyCovered: 0.8,
      clusterAnalysisRan: true,
      sources: ['test'],
      synthetic: false,
    },
    fetchedAtMs: NOW,
  };
  return { ...base, ...overrides };
}

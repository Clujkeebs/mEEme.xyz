import { z } from 'zod';
import { fetchJson } from './http';

/**
 * DexScreener — price, liquidity, volume, order-flow counts and pair age.
 * No API key required.
 *
 * This is the backbone of every snapshot: without it we have no price, and
 * without a price nothing downstream means anything.
 */

const BASE = process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com';

/** Upstream sends numbers as strings in some fields and numbers in others. */
const numeric = z.union([z.number(), z.string()]).nullish().transform((v) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
});

const windowCounts = z
  .object({ buys: z.number().nullish(), sells: z.number().nullish() })
  .nullish();

const pairSchema = z.object({
  chainId: z.string().nullish(),
  dexId: z.string().nullish(),
  pairAddress: z.string().nullish(),
  baseToken: z
    .object({
      address: z.string().nullish(),
      name: z.string().nullish(),
      symbol: z.string().nullish(),
    })
    .nullish(),
  priceUsd: numeric,
  txns: z
    .object({ m5: windowCounts, h1: windowCounts, h6: windowCounts, h24: windowCounts })
    .nullish(),
  volume: z
    .object({ m5: numeric, h1: numeric, h6: numeric, h24: numeric })
    .nullish(),
  priceChange: z
    .object({ m5: numeric, h1: numeric, h6: numeric, h24: numeric })
    .nullish(),
  liquidity: z.object({ usd: numeric }).nullish(),
  fdv: numeric,
  marketCap: numeric,
  pairCreatedAt: z.number().nullish(),
});

const responseSchema = z.object({
  pairs: z.array(pairSchema).nullish(),
});

export interface DexScreenerMarket {
  symbol: string;
  name: string;
  priceUsd: number;
  liquidityUsd: number;
  fdvUsd: number;
  ageMinutes: number;
  volumeUsd: { m5: number; h1: number; h6: number; h24: number };
  priceChangePct: { m5: number; h1: number; h6: number; h24: number };
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  pairAddress: string | null;
}

const n = (v: number | null | undefined, fallback = 0): number =>
  v === null || v === undefined || !Number.isFinite(v) ? fallback : v;

const counts = (
  w: { buys?: number | null; sells?: number | null } | null | undefined,
): { buys: number; sells: number } => ({
  buys: n(w?.buys),
  sells: n(w?.sells),
});

export async function fetchDexScreenerMarket(
  tokenAddress: string,
  nowMs: number = Date.now(),
): Promise<DexScreenerMarket | null> {
  const data = await fetchJson({
    provider: 'dexscreener',
    url: `${BASE}/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`,
    schema: responseSchema,
    revalidateSeconds: 20,
  });

  const pairs = data?.pairs;
  if (!pairs || pairs.length === 0) return null;

  // A token can trade on many pools. The deepest one is the one that sets the
  // price everyone else arbitrages to, so that is the one we read.
  const deepest = pairs.reduce((best, p) =>
    n(p.liquidity?.usd) > n(best.liquidity?.usd) ? p : best,
  );

  const priceUsd = n(deepest.priceUsd);
  if (priceUsd <= 0) return null;

  const createdAt = deepest.pairCreatedAt ?? null;
  const ageMinutes = createdAt ? Math.max(1, (nowMs - createdAt) / 60_000) : 60 * 24;

  return {
    symbol: deepest.baseToken?.symbol ?? 'UNKNOWN',
    name: deepest.baseToken?.name ?? 'Unknown token',
    priceUsd,
    liquidityUsd: n(deepest.liquidity?.usd),
    // FDV is occasionally absent; market cap is the next best proxy.
    fdvUsd: n(deepest.fdv) || n(deepest.marketCap),
    ageMinutes,
    volumeUsd: {
      m5: n(deepest.volume?.m5),
      h1: n(deepest.volume?.h1),
      h6: n(deepest.volume?.h6),
      h24: n(deepest.volume?.h24),
    },
    priceChangePct: {
      m5: n(deepest.priceChange?.m5),
      h1: n(deepest.priceChange?.h1),
      h6: n(deepest.priceChange?.h6),
      h24: n(deepest.priceChange?.h24),
    },
    txns: {
      m5: counts(deepest.txns?.m5),
      h1: counts(deepest.txns?.h1),
      h6: counts(deepest.txns?.h6),
      h24: counts(deepest.txns?.h24),
    },
    pairAddress: deepest.pairAddress ?? null,
  };
}

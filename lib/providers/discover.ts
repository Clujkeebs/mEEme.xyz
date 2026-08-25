import { z } from 'zod';
import { fetchJson } from './http';

/**
 * Token discovery.
 *
 * The public track record is the trust argument, and on day one it is empty —
 * which is the least persuasive possible version of "look at our record". This
 * lets the engine scan the market on its own so the ledger has real, graded
 * calls in it before the first user arrives, rather than waiting for traffic
 * that will not come until the ledger is convincing.
 */

const BASE = process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com';

const boostSchema = z.array(
  z.object({
    chainId: z.string().nullish(),
    tokenAddress: z.string().nullish(),
  }),
);

const searchSchema = z.object({
  pairs: z
    .array(
      z.object({
        chainId: z.string().nullish(),
        baseToken: z.object({ address: z.string().nullish(), symbol: z.string().nullish() }).nullish(),
        liquidity: z.object({ usd: z.union([z.number(), z.string()]).nullish() }).nullish(),
        volume: z.object({ h24: z.union([z.number(), z.string()]).nullish() }).nullish(),
        pairCreatedAt: z.number().nullish(),
      }),
    )
    .nullish(),
});

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

/**
 * A token has to clear these before it is worth a call. Scanning dust would
 * fill the ledger with reads nobody could have acted on, which would make the
 * accuracy number meaningless in both directions.
 */
export const SCAN_MIN_LIQUIDITY_USD = 25_000;
export const SCAN_MIN_VOLUME_H24_USD = 50_000;

/**
 * And an upper bound, which production taught us the hard way.
 *
 * Searching DexScreener for "SOL" matches the quote side of essentially every
 * Solana pair — including the SOL pools themselves. Ranking by churn then put
 * wrapped SOL at $1.6B liquidity at the top and spent three of twelve candidate
 * slots on it. The engine has nothing to say about SOL: its float is not held
 * by a deployer-linked cluster, and there is no trapdoor under a major.
 */
export const SCAN_MAX_LIQUIDITY_USD = 50_000_000;

/**
 * Assets to never scan. Majors and stablecoins are not what this tool is for,
 * and they dominate any volume-based ranking.
 */
const EXCLUDED_MINTS = new Set([
  'So11111111111111111111111111111111111111112', // wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // wETH
]);

/**
 * Symbols that should never appear as a scan candidate even if the mint is one
 * we do not know. A token calling itself SOL is either a wrapper or a
 * impersonation, and neither is a trade this tool should be recommending.
 */
const EXCLUDED_SYMBOLS = new Set(['SOL', 'WSOL', 'USDC', 'USDT', 'USDS', 'ETH', 'WETH', 'BTC', 'WBTC']);

export interface Candidate {
  address: string;
  symbol: string;
  liquidityUsd: number;
  volumeH24Usd: number;
  ageMinutes: number;
}

/** Boosted tokens — a paid-for signal of attention, which is where the action is. */
async function fromBoosts(): Promise<string[]> {
  const data = await fetchJson({
    provider: 'dexscreener:boosts',
    url: `${BASE}/token-boosts/latest/v1`,
    schema: boostSchema,
    revalidateSeconds: 300,
  });
  if (!data) return [];
  return data
    .filter((b) => b.chainId === 'solana' && b.tokenAddress)
    .map((b) => b.tokenAddress as string);
}

/** Search results, used to widen the net beyond whatever is being boosted. */
async function fromSearch(query: string): Promise<Candidate[]> {
  const data = await fetchJson({
    provider: 'dexscreener:search',
    url: `${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`,
    schema: searchSchema,
    revalidateSeconds: 180,
  });
  if (!data?.pairs) return [];

  const now = Date.now();
  const out: Candidate[] = [];
  for (const pair of data.pairs) {
    if (pair.chainId !== 'solana') continue;
    const address = pair.baseToken?.address;
    if (!address) continue;
    out.push({
      address,
      symbol: pair.baseToken?.symbol ?? '',
      liquidityUsd: num(pair.liquidity?.usd),
      volumeH24Usd: num(pair.volume?.h24),
      ageMinutes: pair.pairCreatedAt ? (now - pair.pairCreatedAt) / 60_000 : 60 * 24,
    });
  }
  return out;
}

/**
 * Candidates worth a scan, best first.
 *
 * Ranked by volume relative to liquidity — churn against a thin book is where
 * supply structure actually decides the outcome, and where the engine has
 * something to say that a chart does not.
 */
export async function discoverCandidates(limit = 12): Promise<Candidate[]> {
  const [boosted, searched] = await Promise.all([
    fromBoosts(),
    // "SOL" matches the quote side of essentially every Solana memecoin pair.
    fromSearch('SOL'),
  ]);

  const byAddress = new Map<string, Candidate>();
  for (const c of searched) {
    const existing = byAddress.get(c.address);
    if (!existing || c.liquidityUsd > existing.liquidityUsd) byAddress.set(c.address, c);
  }
  // Boosted tokens we know nothing else about still deserve a look.
  for (const address of boosted) {
    if (!byAddress.has(address)) {
      byAddress.set(address, { address, symbol: '', liquidityUsd: 0, volumeH24Usd: 0, ageMinutes: 0 });
    }
  }

  const qualified = [...byAddress.values()].filter((c) => {
    if (EXCLUDED_MINTS.has(c.address)) return false;
    if (c.symbol && EXCLUDED_SYMBOLS.has(c.symbol.toUpperCase())) return false;
    // Unknowns from the boost list pass through; buildSnapshot will price them.
    if (c.liquidityUsd === 0 && c.volumeH24Usd === 0) return true;
    return (
      c.liquidityUsd >= SCAN_MIN_LIQUIDITY_USD &&
      c.liquidityUsd <= SCAN_MAX_LIQUIDITY_USD &&
      c.volumeH24Usd >= SCAN_MIN_VOLUME_H24_USD
    );
  });

  return qualified
    .sort((a, b) => {
      const churnA = a.liquidityUsd > 0 ? a.volumeH24Usd / a.liquidityUsd : 0;
      const churnB = b.liquidityUsd > 0 ? b.volumeH24Usd / b.liquidityUsd : 0;
      return churnB - churnA;
    })
    .slice(0, limit);
}

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
        baseToken: z.object({ address: z.string().nullish() }).nullish(),
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

export interface Candidate {
  address: string;
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
      byAddress.set(address, { address, liquidityUsd: 0, volumeH24Usd: 0, ageMinutes: 0 });
    }
  }

  const qualified = [...byAddress.values()].filter(
    (c) =>
      // Unknowns from the boost list pass through; buildSnapshot will price them.
      (c.liquidityUsd === 0 && c.volumeH24Usd === 0) ||
      (c.liquidityUsd >= SCAN_MIN_LIQUIDITY_USD && c.volumeH24Usd >= SCAN_MIN_VOLUME_H24_USD),
  );

  return qualified
    .sort((a, b) => {
      const churnA = a.liquidityUsd > 0 ? a.volumeH24Usd / a.liquidityUsd : 0;
      const churnB = b.liquidityUsd > 0 ? b.volumeH24Usd / b.liquidityUsd : 0;
      return churnB - churnA;
    })
    .slice(0, limit);
}

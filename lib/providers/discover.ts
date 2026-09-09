import { z } from 'zod';
import { fetchTopPools } from './geckoterminal';
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

/**
 * The batch token endpoint returns the pairs for up to thirty mints at once,
 * which is what makes pricing the boost list affordable: one request instead of
 * one per token.
 */
const tokensSchema = z.array(
  z.object({
    chainId: z.string().nullish(),
    baseToken: z.object({ address: z.string().nullish(), symbol: z.string().nullish() }).nullish(),
    liquidity: z.object({ usd: z.union([z.number(), z.string()]).nullish() }).nullish(),
    volume: z.object({ h24: z.union([z.number(), z.string()]).nullish() }).nullish(),
    pairCreatedAt: z.number().nullish(),
  }),
);

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
  /**
   * The pool this candidate was found in, when the source knew one.
   *
   * Only the volume ranking supplies it. Carrying it means the candle fetch can
   * ask about the pool that actually ranked rather than whichever one a second
   * provider resolves — and when that second lookup comes back empty, which
   * production showed it doing, there is still a pool to ask with.
   */
  poolAddress?: string | null;
}

/**
 * Boosted tokens — a paid-for signal of attention, which is where the action is.
 *
 * Two lists, because they are different populations rather than the same one
 * ordered differently: `latest` is whatever was boosted most recently, `top` is
 * whatever carries the most boosts right now, and a token can easily be in one
 * and not the other. With the search path contributing nothing (see
 * discoverCandidates), these are the only sources actually feeding the scanner,
 * so a second one is worth having.
 *
 * Each is independent: if one endpoint fails, fetchJson returns null and the
 * other still supplies a pool.
 */
async function fromBoosts(path: 'latest' | 'top'): Promise<string[]> {
  const data = await fetchJson({
    provider: `dexscreener:boosts:${path}`,
    url: `${BASE}/token-boosts/${path}/v1`,
    schema: boostSchema,
    revalidateSeconds: 300,
  });
  if (!data) return [];
  return data
    .filter((b) => b.chainId === 'solana' && b.tokenAddress)
    .map((b) => b.tokenAddress as string);
}

/**
 * Recently published token profiles. A third address list of the same shape:
 * a project that has bothered to fill in a profile is a project doing
 * promotion, which is the same attention signal the boost lists carry, sourced
 * differently enough to surface names neither of them has.
 */
async function fromProfiles(): Promise<string[]> {
  const data = await fetchJson({
    provider: 'dexscreener:profiles',
    url: `${BASE}/token-profiles/latest/v1`,
    schema: boostSchema,
    revalidateSeconds: 300,
  });
  if (!data) return [];
  return data
    .filter((b) => b.chainId === 'solana' && b.tokenAddress)
    .map((b) => b.tokenAddress as string);
}

/** DexScreener takes at most thirty addresses per batch lookup. */
const TOKEN_BATCH_SIZE = 30;

/**
 * Price a set of mints in as few requests as possible.
 *
 * The boost list arrives as bare addresses with no market data, and every one
 * of them used to enter the scan batch unpriced — which meant the liquidity and
 * volume bounds could not be applied to them at all, and roughly half came back
 * below the floor after buildSnapshot had already spent its expensive
 * per-holder work on them.
 *
 * Returns whatever it could price. A failure here is not fatal: the caller
 * keeps the old passthrough behaviour for anything still unpriced, so a bad
 * response degrades this to exactly what it replaced rather than emptying the
 * pool.
 */
async function priceTokens(addresses: string[], nowMs: number): Promise<Map<string, Candidate>> {
  const out = new Map<string, Candidate>();

  for (let i = 0; i < addresses.length; i += TOKEN_BATCH_SIZE) {
    const chunk = addresses.slice(i, i + TOKEN_BATCH_SIZE);
    if (chunk.length === 0) continue;

    const data = await fetchJson({
      provider: 'dexscreener:tokens',
      url: `${BASE}/tokens/v1/solana/${chunk.join(',')}`,
      schema: tokensSchema,
      revalidateSeconds: 180,
    });
    if (!data) continue;

    for (const pair of data) {
      if (pair.chainId !== 'solana') continue;
      const address = pair.baseToken?.address;
      if (!address) continue;
      const candidate: Candidate = {
        address,
        symbol: pair.baseToken?.symbol ?? '',
        liquidityUsd: num(pair.liquidity?.usd),
        volumeH24Usd: num(pair.volume?.h24),
        ageMinutes: pair.pairCreatedAt ? (nowMs - pair.pairCreatedAt) / 60_000 : 60 * 24,
      };
      // A mint can have several pairs; keep its deepest.
      const existing = out.get(address);
      if (!existing || candidate.liquidityUsd > existing.liquidityUsd) out.set(address, candidate);
    }
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
/*
 * There is no search path here any more, and the reason is worth keeping.
 *
 * It searched DexScreener for "SOL" and "USDC" on the theory that those match
 * the quote side of essentially every Solana memecoin pair. They do not.
 * DexScreener's search matches a token's own name, symbol and address, so
 * querying a quote currency returns that currency's own pools — and the
 * rejection counters said so exactly: of twenty-three unique results per pass,
 * twenty-one were thrown out by the majors symbol filter and the rest missed
 * the liquidity and volume bars. Yield was zero, every pass, for two HTTP
 * requests each time.
 *
 * Adding the USDC term was mine, and I claimed it widened the pool without
 * checking. It doubled a mechanism that produced nothing.
 *
 * What is left are address lists, which do work: the two boost lists and the
 * token-profile list. All three are batch-priced before the bounds are applied,
 * so a candidate is judged on real liquidity rather than passed through blind.
 */

export async function discoverCandidates(limit = 12): Promise<Candidate[]> {
  const [boostLatest, boostTop, profiles, pools1, pools2] = await Promise.all([
    fromBoosts('latest'),
    fromBoosts('top'),
    fromProfiles(),
    // Two pages of the busiest Solana pools. Unlike the promotion lists these
    // arrive already priced, and they are the population most likely to clear
    // the bars — see fetchTopPools for why that matters.
    fetchTopPools(1),
    fetchTopPools(2),
  ]);
  const boosted = [...new Set([...boostLatest, ...boostTop, ...profiles])];
  const topPools = [...pools1, ...pools2];

  /*
   * Where the pool comes from, and where it goes.
   *
   * Discovery — not the scan batching, and not the engine's thresholds — is
   * what caps how fast the public ledger can grow, so one line every thirty
   * minutes records each source's contribution and each rejection clause. That
   * is how the dead search path was found: the counters said twenty-one of its
   * twenty-three results were majors, every pass.
   */
  const byAddress = new Map<string, Candidate>();

  // Volume-ranked pools first: they come with real reserve and volume figures,
  // so they never need the batch lookup below and they set the entry for any
  // mint a promotion list also names.
  for (const pool of topPools) {
    const existing = byAddress.get(pool.address);
    if (existing && existing.liquidityUsd >= pool.liquidityUsd) continue;
    byAddress.set(pool.address, {
      address: pool.address,
      symbol: '',
      liquidityUsd: pool.liquidityUsd,
      volumeH24Usd: pool.volumeH24Usd,
      ageMinutes: pool.ageMinutes,
      poolAddress: pool.poolAddress,
    });
  }

  /*
   * Price every address before it reaches the bounds check.
   *
   * These lists carry bare mints with no market data, so the liquidity and
   * volume bounds could not be applied to them at all — there was nothing to
   * check against — and roughly half then came back under the floor at snapshot
   * time, after buildSnapshot had already spent its per-holder Helius work on
   * them. One batch request prices up to thirty, which also gives them a real
   * churn figure instead of the zero that sorted them last.
   */
  const nowMs = Date.now();
  const needPricing = boosted.filter((a) => !byAddress.has(a));
  const priced = needPricing.length > 0 ? await priceTokens(needPricing, nowMs) : new Map<string, Candidate>();

  for (const address of boosted) {
    if (byAddress.has(address)) continue;
    const known = priced.get(address);
    // Still unpriced means the batch call could not answer for this mint. Keep
    // the old passthrough rather than dropping it: buildSnapshot can still
    // price it, and a failed lookup should not shrink the pool.
    byAddress.set(
      address,
      known ?? { address, symbol: '', liquidityUsd: 0, volumeH24Usd: 0, ageMinutes: 0 },
    );
  }

  /*
   * Why a candidate was dropped, counted.
   *
   * Every pass rejects all twenty-odd search results and there are five
   * different bounds that could be doing it. Three separate guesses at this job
   * have now been wrong, and the endpoint is not reachable from the environment
   * this is written in, so the only honest way to pick the right fix is to make
   * the filter say which clause fired.
   */
  const rejected = { mint: 0, symbol: 0, thin: 0, deep: 0, quiet: 0 };

  const qualified = [...byAddress.values()].filter((c) => {
    if (EXCLUDED_MINTS.has(c.address)) {
      rejected.mint++;
      return false;
    }
    if (c.symbol && EXCLUDED_SYMBOLS.has(c.symbol.toUpperCase())) {
      rejected.symbol++;
      return false;
    }
    // Unknowns pass through; buildSnapshot will price them. Since the boost
    // list is batch-priced above, this now only catches mints that lookup
    // could not answer for.
    if (c.liquidityUsd === 0 && c.volumeH24Usd === 0) return true;

    if (c.liquidityUsd < SCAN_MIN_LIQUIDITY_USD) {
      rejected.thin++;
      return false;
    }
    if (c.liquidityUsd > SCAN_MAX_LIQUIDITY_USD) {
      rejected.deep++;
      return false;
    }
    if (c.volumeH24Usd < SCAN_MIN_VOLUME_H24_USD) {
      rejected.quiet++;
      return false;
    }
    return true;
  });

  // Unpriced boost entries sort last (churn 0), so they only reach the batch
  // when there are not enough priced candidates to fill it — which, at a pool
  // this size, is most passes. Counted separately because they are the ones
  // most likely to come back too thin once buildSnapshot prices them.
  const unpriced = qualified.filter((c) => c.liquidityUsd === 0).length;

  console.log(
    `[discover] boostLatest=${boostLatest.length} boostTop=${boostTop.length} ` +
      `profiles=${profiles.length} union=${boosted.length} topPools=${topPools.length} ` +
      `boostPriced=${priced.size}/${needPricing.length} pool=${byAddress.size} ` +
      `qualified=${qualified.length} unpriced=${unpriced} returned=${Math.min(qualified.length, limit)} ` +
      `rejected[mint=${rejected.mint} symbol=${rejected.symbol} thin=${rejected.thin} ` +
      `deep=${rejected.deep} quiet=${rejected.quiet}]`,
  );

  return qualified
    .sort((a, b) => {
      const churnA = a.liquidityUsd > 0 ? a.volumeH24Usd / a.liquidityUsd : 0;
      const churnB = b.liquidityUsd > 0 ? b.volumeH24Usd / b.liquidityUsd : 0;
      return churnB - churnA;
    })
    .slice(0, limit);
}

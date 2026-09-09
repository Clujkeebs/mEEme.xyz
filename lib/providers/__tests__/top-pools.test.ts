import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Volume-ranked pools as a discovery source.
 *
 * The promotion lists this app discovered from are, by their nature, cheapest
 * for the smallest projects: production measured thirty-two of thirty-nine
 * candidates under the $25k liquidity floor. That is the floor doing its job,
 * and it left about six usable candidates a pass. Pools near the top of Solana
 * by traded volume are the opposite population.
 */

let poolsBody: unknown = null;
const requested: string[] = [];

vi.mock('../http', () => ({
  fetchJson: vi.fn(async ({ url }: { url: string }) => {
    requested.push(url);
    return url.includes('/pools?') ? poolsBody : null;
  }),
}));

const { fetchTopPools } = await import('../geckoterminal');

const MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

function pool(
  tokenId: string,
  reserve: unknown,
  volume: unknown,
  createdAt?: string,
  poolAddress?: string,
) {
  return {
    attributes: {
      ...(poolAddress ? { address: poolAddress } : {}),
      reserve_in_usd: reserve,
      volume_usd: { h24: volume },
      ...(createdAt ? { pool_created_at: createdAt } : {}),
    },
    relationships: { base_token: { data: { id: tokenId } } },
  };
}

beforeEach(() => {
  poolsBody = null;
  requested.length = 0;
});

describe('fetchTopPools', () => {
  it('strips the network prefix off the base token id', async () => {
    poolsBody = { data: [pool(`solana_${MINT}`, '250000.5', '900000.25')] };
    const out = await fetchTopPools(1);
    expect(out).toHaveLength(1);
    expect(out[0]?.address).toBe(MINT);
  });

  it('accepts an unprefixed id rather than discarding a usable address', async () => {
    poolsBody = { data: [pool(MINT, 250_000, 900_000)] };
    expect((await fetchTopPools(1))[0]?.address).toBe(MINT);
  });

  it('parses reserve and volume whether they arrive as strings or numbers', async () => {
    poolsBody = { data: [pool(`solana_${MINT}`, '250000.5', 900_000)] };
    const out = await fetchTopPools(1);
    expect(out[0]?.liquidityUsd).toBeCloseTo(250_000.5, 4);
    expect(out[0]?.volumeH24Usd).toBe(900_000);
  });

  it('reads pool age when given, and falls back to a day when not', async () => {
    const now = Date.UTC(2026, 8, 9, 12, 0, 0);
    poolsBody = {
      data: [
        pool(`solana_${MINT}`, 1, 1, new Date(now - 120 * 60_000).toISOString()),
        pool(`solana_${MINT.slice(0, 31)}X`, 1, 1),
      ],
    };
    const out = await fetchTopPools(1, now);
    expect(out[0]?.ageMinutes).toBeCloseTo(120, 3);
    expect(out[1]?.ageMinutes).toBe(60 * 24);
  });

  it('skips a pool with no resolvable base token instead of emitting a blank', async () => {
    poolsBody = { data: [pool('', 1, 1), pool('solana_short', 1, 1), pool(`solana_${MINT}`, 1, 1)] };
    const out = await fetchTopPools(1);
    expect(out).toHaveLength(1);
    expect(out[0]?.address).toBe(MINT);
  });

  it('treats missing figures as zero rather than NaN', async () => {
    // A NaN reaching the qualification bounds would compare false against every
    // one of them and silently drop a candidate for the wrong reason.
    poolsBody = { data: [pool(`solana_${MINT}`, null, undefined)] };
    const out = await fetchTopPools(1);
    expect(out[0]?.liquidityUsd).toBe(0);
    expect(out[0]?.volumeH24Usd).toBe(0);
    expect(Number.isFinite(out[0]!.ageMinutes)).toBe(true);
  });

  it('returns nothing when the endpoint cannot be read, rather than throwing', async () => {
    poolsBody = null;
    expect(await fetchTopPools(1)).toEqual([]);
    poolsBody = { data: null };
    expect(await fetchTopPools(1)).toEqual([]);
  });

  it('asks for the page it was given', async () => {
    poolsBody = { data: [] };
    await fetchTopPools(3);
    expect(requested.some((u) => u.includes('page=3'))).toBe(true);
  });
});

describe('the pool address travels with the candidate', () => {
  it('keeps the pool that produced the ranking', async () => {
    /*
     * Candles are keyed by pool. Discovery used to drop this and let
     * buildSnapshot ask DexScreener to resolve one all over again — and when
     * that came back empty there was no pool to fetch candles with at all,
     * which production showed as "none:0.05/0.00@1581m/0c[dexscreener+rugcheck]"
     * on a token a full day old.
     */
    poolsBody = { data: [pool(`solana_${MINT}`, 250_000, 900_000, undefined, 'POOL_ADDR_1')] };
    const out = await fetchTopPools(1);
    expect(out[0]?.poolAddress).toBe('POOL_ADDR_1');
  });

  it('reports null rather than an empty string when the pool has no address', async () => {
    // Null is what the caller falls back on; '' would be treated as a pool.
    poolsBody = { data: [pool(`solana_${MINT}`, 250_000, 900_000)] };
    expect(await fetchTopPools(1).then((o) => o[0]?.poolAddress)).toBeNull();
  });
});

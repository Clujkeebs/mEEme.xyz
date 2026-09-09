import { z } from 'zod';
import type { Candle } from '@/lib/engine/types';
import { fetchJson } from './http';

/**
 * GeckoTerminal — price history, with no API key.
 *
 * This is what turns the mechanic on for a deployment that has configured
 * nothing. The cost-basis distribution is derived from where volume actually
 * traded, so candles are not chart decoration here — without them there is no
 * coil at all, and the first live scan proved it: every token came back with
 * zero candles, zero supply coverage, and confidence below the floor, so the
 * engine correctly refused to log a single call.
 *
 * Birdeye does the same job with higher rate limits and is preferred when a key
 * is present. This exists so that a key is an upgrade rather than a
 * prerequisite.
 *
 * Keyed by *pool* address, not token address — DexScreener already hands us the
 * deepest pool for the token, so that is what we pass.
 */

const BASE = process.env.GECKOTERMINAL_BASE_URL || 'https://api.geckoterminal.com/api/v2';

/** The keyless tier is roughly 30 requests/minute. Snapshots are cached hard for this reason. */
const TIMEOUT_MS = 12_000;

const ohlcvSchema = z.object({
  data: z
    .object({
      attributes: z
        .object({
          // [timestamp, open, high, low, close, volume]
          ohlcv_list: z.array(z.array(z.union([z.number(), z.string(), z.null()]))).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

type Timeframe = 'minute' | 'hour' | 'day';

/**
 * Resolution has to cover enough turnover to describe who currently holds the
 * float, without asking for more bars than one response returns.
 */
export function resolutionForAge(ageMinutes: number): {
  timeframe: Timeframe;
  aggregate: number;
  limit: number;
} {
  if (ageMinutes <= 180) return { timeframe: 'minute', aggregate: 1, limit: 300 };
  if (ageMinutes <= 900) return { timeframe: 'minute', aggregate: 5, limit: 300 };
  if (ageMinutes <= 4320) return { timeframe: 'minute', aggregate: 15, limit: 300 };
  if (ageMinutes <= 20160) return { timeframe: 'hour', aggregate: 1, limit: 400 };
  return { timeframe: 'hour', aggregate: 4, limit: 400 };
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

/**
 * Candles for a pool. Returns null rather than throwing so a rate limit or an
 * outage degrades the read instead of failing it.
 */
export async function fetchGeckoCandles(
  poolAddress: string,
  ageMinutes: number,
): Promise<Candle[] | null> {
  const { timeframe, aggregate, limit } = resolutionForAge(ageMinutes);

  const data = await fetchJson({
    provider: `geckoterminal:ohlcv:${timeframe}${aggregate}`,
    url:
      `${BASE}/networks/solana/pools/${encodeURIComponent(poolAddress)}/ohlcv/${timeframe}` +
      `?aggregate=${aggregate}&limit=${limit}&currency=usd`,
    schema: ohlcvSchema,
    timeoutMs: TIMEOUT_MS,
    // One retry only: on a keyless tier, hammering a 429 makes it worse.
    retries: 1,
    revalidateSeconds: timeframe === 'minute' && aggregate === 1 ? 45 : 180,
  });

  const rows = data?.data?.attributes?.ohlcv_list;
  if (!rows || rows.length === 0) return null;

  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;

    const timeSec = num(row[0]);
    const open = num(row[1]);
    const high = num(row[2]);
    const low = num(row[3]);
    const close = num(row[4]);
    const volumeUsd = num(row[5]) ?? 0;

    // A bar missing any leg is unusable. Drop it rather than invent a value —
    // the distribution is built from these and a fabricated bar becomes a
    // fabricated shelf.
    if (
      timeSec === null || open === null || high === null ||
      low === null || close === null || close <= 0
    ) continue;

    candles.push({ timeSec, open, high, low, close, volumeUsd });
  }

  if (candles.length === 0) return null;

  // GeckoTerminal returns newest first; everything downstream assumes oldest first.
  return candles.sort((a, b) => a.timeSec - b.timeSec);
}


/* ------------------------------ top pools -------------------------------- */

/**
 * Solana pools ranked by 24-hour volume.
 *
 * The address lists this app discovers from — boosted tokens and token
 * profiles — are promotion signals, and promotion is cheapest for the smallest
 * projects: production measured thirty-two of thirty-nine of them sitting under
 * the $25k liquidity floor. That is the floor working, not failing, but it
 * leaves roughly six usable candidates a pass.
 *
 * This is the opposite population. A pool near the top of Solana by traded
 * volume clears the volume bar by construction and usually the liquidity bar
 * too, and it is exactly the shape the engine has something to say about:
 * real churn against a real book, where supply structure decides the outcome.
 *
 * Reserve and volume come back in the response, so these candidates arrive
 * already priced and need no batch lookup.
 */
const poolsSchema = z.object({
  data: z
    .array(
      z.object({
        attributes: z
          .object({
            reserve_in_usd: z.union([z.number(), z.string()]).nullish(),
            volume_usd: z.object({ h24: z.union([z.number(), z.string()]).nullish() }).nullish(),
            pool_created_at: z.string().nullish(),
          })
          .nullish(),
        relationships: z
          .object({
            base_token: z.object({ data: z.object({ id: z.string().nullish() }).nullish() }).nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
});

export interface TopPool {
  address: string;
  liquidityUsd: number;
  volumeH24Usd: number;
  ageMinutes: number;
}

const toNum = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

/**
 * GeckoTerminal namespaces token ids by network, so a base token comes back as
 * "solana_<mint>". Strip it defensively rather than assuming the prefix is
 * always there — an unprefixed id is still a usable address.
 */
function mintFromTokenId(id: string | null | undefined): string | null {
  if (!id) return null;
  const bare = id.startsWith('solana_') ? id.slice('solana_'.length) : id;
  return bare.length >= 32 ? bare : null;
}

/** One page is twenty pools. Returns [] on any failure — callers treat it as optional. */
export async function fetchTopPools(page = 1, nowMs = Date.now()): Promise<TopPool[]> {
  const data = await fetchJson({
    provider: `geckoterminal:pools:${page}`,
    url: `${BASE}/networks/solana/pools?page=${page}`,
    schema: poolsSchema,
    revalidateSeconds: 300,
  });
  if (!data?.data) return [];

  const out: TopPool[] = [];
  for (const pool of data.data) {
    const address = mintFromTokenId(pool.relationships?.base_token?.data?.id);
    if (!address) continue;
    const created = pool.attributes?.pool_created_at;
    const createdMs = created ? Date.parse(created) : Number.NaN;
    out.push({
      address,
      liquidityUsd: toNum(pool.attributes?.reserve_in_usd),
      volumeH24Usd: toNum(pool.attributes?.volume_usd?.h24),
      ageMinutes: Number.isFinite(createdMs) ? (nowMs - createdMs) / 60_000 : 60 * 24,
    });
  }
  return out;
}

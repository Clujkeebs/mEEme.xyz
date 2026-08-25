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

import { z } from 'zod';
import { fetchJson, providerConfigured } from './http';
import type { Candle } from '@/lib/engine/types';

/**
 * Birdeye — OHLCV candles for the chart and for the volatility term in the
 * stop calculation. Optional: without it the chart is empty and the engine
 * falls back to a default range assumption, which it states plainly.
 */

const KEY = process.env.BIRDEYE_API_KEY ?? '';
export const birdeyeConfigured = (): boolean => providerConfigured(KEY);

const BASE = 'https://public-api.birdeye.so';

const ohlcvSchema = z.object({
  success: z.boolean().nullish(),
  data: z
    .object({
      items: z
        .array(
          z.object({
            unixTime: z.number().nullish(),
            o: z.number().nullish(),
            h: z.number().nullish(),
            l: z.number().nullish(),
            c: z.number().nullish(),
            v: z.number().nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});

const priceSchema = z.object({
  data: z.object({ value: z.number().nullish() }).nullish(),
});

const headers = (): Record<string, string> => ({
  'X-API-KEY': KEY,
  'x-chain': 'solana',
});

type Interval = '1m' | '5m' | '15m' | '1H' | '4H';

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400,
};

/**
 * Candles are no longer just chart decoration — they are the primary input to
 * the cost-basis distribution, so the window has to cover enough turnover to
 * describe who currently holds the float.
 *
 * Resolution is chosen from the token's age: a token minted an hour ago needs
 * minute bars, a week-old one needs hours of coverage more than it needs
 * minute-level detail. Birdeye caps the number of bars per response, so asking
 * for 1m over a week would silently truncate to the most recent slice and quietly
 * throw away the history the profile depends on.
 */
export function intervalForAge(ageMinutes: number): { interval: Interval; windowMinutes: number } {
  if (ageMinutes <= 180) return { interval: '1m', windowMinutes: Math.max(60, ageMinutes) };
  if (ageMinutes <= 1440) return { interval: '5m', windowMinutes: ageMinutes };
  if (ageMinutes <= 10_080) return { interval: '15m', windowMinutes: Math.min(ageMinutes, 10_080) };
  return { interval: '1H', windowMinutes: Math.min(ageMinutes, 43_200) };
}

/**
 * Candles covering the token's life, at a resolution that fits in one response.
 */
export async function fetchCandles(
  tokenAddress: string,
  ageMinutes = 240,
  nowMs: number = Date.now(),
): Promise<Candle[] | null> {
  if (!birdeyeConfigured()) return null;

  const { interval, windowMinutes } = intervalForAge(ageMinutes);
  const timeTo = Math.floor(nowMs / 1000);
  const timeFrom = timeTo - Math.round(windowMinutes * 60);

  const data = await fetchJson({
    provider: `birdeye:ohlcv:${interval}`,
    url: `${BASE}/defi/ohlcv?address=${encodeURIComponent(tokenAddress)}&type=${interval}&time_from=${timeFrom}&time_to=${timeTo}`,
    schema: ohlcvSchema,
    init: { headers: headers() },
    revalidateSeconds: INTERVAL_SECONDS[interval] >= 900 ? 300 : 45,
  });

  const items = data?.data?.items;
  if (!items || items.length === 0) return null;

  const candles: Candle[] = [];
  for (const it of items) {
    const { unixTime, o, h, l, c } = it;
    // A candle missing any leg is unusable — drop it rather than invent a value.
    if (
      unixTime === null || unixTime === undefined ||
      o === null || o === undefined ||
      h === null || h === undefined ||
      l === null || l === undefined ||
      c === null || c === undefined ||
      c <= 0
    ) continue;

    candles.push({ timeSec: unixTime, open: o, high: h, low: l, close: c, volumeUsd: it.v ?? 0 });
  }

  return candles.length > 0 ? candles.sort((a, b) => a.timeSec - b.timeSec) : null;
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * SOL price, needed to convert the native leg of a swap into USD when
 * reconstructing cost basis. Falls back to null so callers can decide.
 */
export async function fetchSolPriceUsd(): Promise<number | null> {
  if (!birdeyeConfigured()) return null;
  const data = await fetchJson({
    provider: 'birdeye:price',
    url: `${BASE}/defi/price?address=${SOL_MINT}`,
    schema: priceSchema,
    init: { headers: headers() },
    revalidateSeconds: 60,
  });
  const v = data?.data?.value;
  return v !== null && v !== undefined && v > 0 ? v : null;
}

/**
 * Bounded concurrency for a batch of async work.
 *
 * The scheduled jobs (sweep, score, scan) each walk a list of tokens and fetch
 * a snapshot for every one of them. Doing that sequentially means a sweep
 * touching 40 distinct tokens pays 40 network round trips back to back — at
 * roughly a second each once RugCheck, DexScreener, GeckoTerminal and (when
 * configured) Helius are all in the mix, that is comfortably over a minute for
 * a job meant to run every five. A sweep that falls behind its own cadence is
 * the paid tier's core promise — alerts while you sleep — quietly not being
 * kept.
 *
 * Unbounded concurrency (a bare `Promise.all`) trades that for a worse
 * problem: GeckoTerminal's keyless tier is roughly 30 requests/minute, and
 * firing 40 requests at once guarantees most of them come back 429 and the
 * whole batch degrades together. A small, fixed concurrency is the same
 * pattern already used for per-wallet history in lib/providers/helius.ts —
 * this is that pattern, pulled out so every caller shares it instead of
 * re-deriving it slightly differently each time.
 */

/**
 * Run `fn` over `items` with at most `concurrency` in flight at once, and
 * return the results in the same order as `items`.
 *
 * A single item's failure never aborts the batch: `fn` is expected to degrade
 * internally (the providers in this codebase return null rather than throw),
 * but as a backstop a throwing `fn` yields `onError`'s result for that item —
 * or `undefined` if `onError` is not supplied — rather than rejecting the
 * whole run over one bad token.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onError?: (error: unknown, item: T, index: number) => R,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index] as T;
      try {
        results[index] = await fn(item, index);
      } catch (err) {
        if (onError) {
          results[index] = onError(err, item, index);
        } else {
          throw err;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

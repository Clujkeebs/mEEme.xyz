/**
 * Client-side pacing for upstream APIs that meter us.
 *
 * meeme-web is a single persistent Node process, so a module-level queue is a
 * real global limiter here rather than a per-request no-op. This exists
 * because bounded *concurrency* alone is not the same as bounded *rate*: five
 * concurrent workers that each finish in 50ms still issue 100 requests a
 * second, which is exactly how the Helius free tier was being exhausted
 * before a single real user ever ran a Target Lock.
 */

interface Pacer {
  /** Resolves when the caller is allowed to issue its request. */
  take(): Promise<void>;
}

export function createPacer(minIntervalMs: number): Pacer {
  let nextFreeAt = 0;
  return {
    async take() {
      const now = Date.now();
      const startAt = Math.max(now, nextFreeAt);
      // Reserve this slot before awaiting, so concurrent callers queue behind
      // each other rather than all reading the same `now` and stampeding.
      nextFreeAt = startAt + minIntervalMs;
      const wait = startAt - now;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    },
  };
}

/**
 * A tiny TTL cache. Wallet transaction history is the expensive thing the
 * sweep re-asks for every few minutes, and a wallet's trade history for a
 * given mint does not meaningfully change between sweeps — so not caching it
 * spent the entire rate-limit budget re-deriving an answer we already had.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh insertion order so the eviction below is roughly LRU.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

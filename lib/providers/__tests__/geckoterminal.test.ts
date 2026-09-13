import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolutionForAge } from '../geckoterminal';

/**
 * Candles are the input to the cost-basis distribution, so the resolution has
 * to cover enough of a token's life to describe who currently holds the float —
 * without asking for more bars than one response returns.
 */
describe('resolutionForAge', () => {
  it('uses minute bars for a token minted in the last few hours', () => {
    const r = resolutionForAge(60);
    expect(r.timeframe).toBe('minute');
    expect(r.aggregate).toBe(1);
  });

  it('coarsens as the token ages so the window still spans its life', () => {
    const ages = [60, 600, 3000, 10000, 40000];
    const spans = ages.map((age) => {
      const r = resolutionForAge(age);
      const minutesPerBar = r.timeframe === 'minute' ? r.aggregate : r.aggregate * 60;
      return minutesPerBar * r.limit;
    });
    // Each step must cover at least as much wall-clock time as the last.
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!).toBeGreaterThanOrEqual(spans[i - 1]!);
    }
  });

  it('covers most of the token lifetime it is chosen for', () => {
    for (const age of [60, 600, 3000, 10000]) {
      const r = resolutionForAge(age);
      const minutesPerBar = r.timeframe === 'minute' ? r.aggregate : r.aggregate * 60;
      expect(minutesPerBar * r.limit).toBeGreaterThanOrEqual(age);
    }
  });

  it('never requests more bars than a single response returns', () => {
    for (const age of [1, 60, 600, 3000, 10000, 100000]) {
      expect(resolutionForAge(age).limit).toBeLessThanOrEqual(1000);
    }
  });

  it('only uses aggregates the API accepts', () => {
    const allowed: Record<string, number[]> = {
      minute: [1, 5, 15],
      hour: [1, 4, 12],
      day: [1],
    };
    for (const age of [1, 60, 200, 600, 3000, 10000, 50000, 500000]) {
      const r = resolutionForAge(age);
      expect(allowed[r.timeframe]).toContain(r.aggregate);
    }
  });
});

/**
 * The keyless tier is documented as ~30 requests/minute, and until production
 * showed GeckoTerminal's own breaker tripping shortly after the Helius scan
 * fix landed, nothing here actually paced calls to it. Cutting the scan pass
 * from ~390s to ~21s concentrated the same per-pass traffic into a much
 * shorter window; bounded concurrency upstream is not the same as bounded
 * rate. These test the pacing in isolation from the test-suite override in
 * vitest.config.ts, which exists only so the rest of the suite does not pay
 * for a rate limit it will never actually hit.
 */
describe('GeckoTerminal request pacing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('../http');
  });

  it('spaces real requests at the configured interval', async () => {
    vi.resetModules();
    vi.stubEnv('GECKOTERMINAL_MIN_INTERVAL_MS', '40');
    const timestamps: number[] = [];
    vi.doMock('../http', () => ({
      fetchJson: vi.fn(async () => {
        timestamps.push(Date.now());
        return null;
      }),
    }));

    const { fetchTopPools } = await import('../geckoterminal');
    const started = Date.now();
    await Promise.all([fetchTopPools(1), fetchTopPools(2), fetchTopPools(3)]);

    // Three calls, 40ms apart — the third should not fire before ~80ms in.
    expect(timestamps).toHaveLength(3);
    expect(Math.max(...timestamps) - started).toBeGreaterThanOrEqual(75);
  });

  it('defaults to roughly the documented free-tier ceiling', async () => {
    vi.resetModules();
    vi.stubEnv('GECKOTERMINAL_MIN_INTERVAL_MS', undefined);
    const timestamps: number[] = [];
    vi.doMock('../http', () => ({
      fetchJson: vi.fn(async () => {
        timestamps.push(Date.now());
        return null;
      }),
    }));

    const { fetchTopPools } = await import('../geckoterminal');
    const started = Date.now();
    await Promise.all([fetchTopPools(1), fetchTopPools(2)]);

    // Default is 2000ms — 30/minute. Only assert the ballpark, not the exact
    // constant, so this does not become a change-detector on the number itself.
    const gap = Math.max(...timestamps) - started;
    expect(gap).toBeGreaterThanOrEqual(1800);
    expect(gap).toBeLessThan(2500);
  }, 10_000);
});

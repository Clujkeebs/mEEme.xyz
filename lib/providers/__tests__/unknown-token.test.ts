import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the app says about a contract address nobody trades.
 *
 * This is the most likely mistake a first-time visitor makes — a typo, a copy
 * from the wrong chain, a token that has not launched — and it used to produce
 * a complete, confident, entirely fabricated read: verdict, coil score, exit
 * ladder, the lot, for a coin that does not exist. The only hint was a toast
 * claiming the deployment had no market feed, which was not even the reason.
 */

const fetchDexScreenerMarket = vi.fn();
const fetchRugcheckReport = vi.fn(async () => null);

vi.mock('../dexscreener', () => ({
  fetchDexScreenerMarket: (...a: unknown[]) => fetchDexScreenerMarket(...(a as [])),
}));
vi.mock('../rugcheck', () => ({
  fetchRugcheckReport: (...a: unknown[]) => fetchRugcheckReport(...(a as [])),
}));

const { buildSnapshot, demoModeForced } = await import('../index');

const ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const REAL_DEMO_FLAG = process.env.MEEME_FORCE_DEMO;

beforeEach(() => {
  // The forced-demo branch short-circuits before any provider is consulted, so
  // it has to be off for these to reach the code under test.
  delete process.env.MEEME_FORCE_DEMO;
  fetchDexScreenerMarket.mockReset();
  fetchRugcheckReport.mockReset();
  fetchRugcheckReport.mockResolvedValue(null);
});

afterEach(() => {
  if (REAL_DEMO_FLAG === undefined) delete process.env.MEEME_FORCE_DEMO;
  else process.env.MEEME_FORCE_DEMO = REAL_DEMO_FLAG;
});

describe('buildSnapshot on a token no provider can price', () => {
  it('returns no snapshot at all rather than inventing one', async () => {
    fetchDexScreenerMarket.mockResolvedValue(null);
    const result = await buildSnapshot(ADDRESS);

    expect(result.mode).toBe('unknown');
    expect(result.snapshot).toBeNull();
  });

  it('does not label it demo, because the deployment is fine', async () => {
    // Conflating these is what produced the misleading caption: 'demo' means
    // this deployment has no feed, and that was not the problem.
    fetchDexScreenerMarket.mockResolvedValue(null);
    const result = await buildSnapshot(ADDRESS);

    expect(result.mode).not.toBe('demo');
    expect(result.sources).not.toContain('demo');
  });

  it('still reports which providers were asked and came back empty', async () => {
    fetchDexScreenerMarket.mockResolvedValue(null);
    const result = await buildSnapshot(ADDRESS);

    expect(result.missing).toContain('dexscreener');
  });

  it('keeps demo mode working when the deployment genuinely has no feed', async () => {
    // The legitimate use of a synthetic snapshot, which this change must not
    // break: with DEMO_MODE on, the product still demonstrates itself.
    process.env.MEEME_FORCE_DEMO = 'true';
    expect(demoModeForced()).toBe(true);
    const result = await buildSnapshot(ADDRESS);

    expect(result.mode).toBe('demo');
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot?.dataQuality.synthetic).toBe(true);
  });
});

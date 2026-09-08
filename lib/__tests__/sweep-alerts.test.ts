import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDemoSnapshot } from '@/lib/providers/demo';
import type { TokenSnapshot } from '@/lib/engine/types';

/**
 * Alert firing — the whole of what the paid tiers sell.
 *
 * This had no coverage and, as of writing, had never executed once in
 * production: there were no tracked positions, so the sweep never reached any
 * of these branches. The first time it runs will be for a stranger who paid for
 * it, on the day their stop breaks. That is not a good time to find out that a
 * comparison is the wrong way round.
 *
 * The providers and the database are mocked; what is under test is the decision
 * to raise an alert at all, and which one.
 */

const ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

const alertCreate = vi.fn();
const alertFindFirst = vi.fn(async () => null as { id: string } | null);
let snapshotResult: { snapshot: TokenSnapshot; mode: 'live' | 'demo' } | null = null;
let openPositions: unknown[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    watch: { findMany: vi.fn(async () => []), update: vi.fn(async () => {}) },
    position: { findMany: vi.fn(async () => openPositions), update: vi.fn(async () => {}) },
    alert: {
      create: (...a: unknown[]) => alertCreate(...a),
      findFirst: (...a: unknown[]) => alertFindFirst(...(a as [])),
    },
  },
}));
vi.mock('@/lib/cache', () => ({ writeCachedSnapshot: vi.fn(async () => {}) }));
vi.mock('@/lib/notify', () => ({
  flushPendingAlerts: vi.fn(async () => ({ sent: 0, failed: 0, held: 0 })),
}));
vi.mock('@/lib/providers', () => ({ buildSnapshot: vi.fn(async () => snapshotResult) }));

const { runSweep } = await import('@/lib/jobs');

/** Every alert kind the sweep created in this run. */
const kindsFired = (): string[] =>
  alertCreate.mock.calls.map((c) => (c[0] as { data: { kind: string } }).data.kind);

const messageFor = (kind: string): string =>
  (alertCreate.mock.calls.find((c) => (c[0] as { data: { kind: string } }).data.kind === kind)?.[0] as
    | { data: { message: string } }
    | undefined)?.data.message ?? '';

/**
 * A position as the sweep loads it, including the marks the previous pass
 * wrote. Those marks are the levels an alert is a crossing *of*, so a position
 * with none has never been swept and cannot have crossed anything.
 */
function position(over: Record<string, unknown> = {}) {
  return {
    id: 'pos_1',
    userId: 'user_1',
    tokenAddress: ADDRESS,
    size: 1_000_000,
    entryPriceUsd: 0.00001,
    markStopUsd: null,
    markNextRungUsd: null,
    markNextRungFraction: null,
    ...over,
  };
}

/** A live-looking snapshot whose price we can place wherever the test needs. */
function snapshotAt(priceUsd: number): TokenSnapshot {
  const s = buildDemoSnapshot(ADDRESS, Date.UTC(2026, 8, 8, 12, 0, 0));
  s.dataQuality.synthetic = false;
  s.priceUsd = priceUsd;
  return s;
}

beforeEach(() => {
  alertCreate.mockReset();
  alertFindFirst.mockReset();
  alertFindFirst.mockResolvedValue(null);
  snapshotResult = { snapshot: snapshotAt(buildDemoSnapshot(ADDRESS, 0).priceUsd), mode: 'live' };
  openPositions = [position()];
});

describe('runSweep alerts', () => {
  it('raises a stop alert when price falls through the stop it was last given', async () => {
    openPositions = [position({ markStopUsd: 0.001 })];
    snapshotResult = { snapshot: snapshotAt(0.0009), mode: 'live' };
    const res = await runSweep();

    expect(kindsFired()).toContain('STOP_HIT');
    expect(res.alertsFired).toBeGreaterThan(0);
    expect(messageFor('STOP_HIT')).toMatch(/stop hit/i);
  });

  it('treats price landing exactly on the stop as through it', async () => {
    openPositions = [position({ markStopUsd: 0.001 })];
    snapshotResult = { snapshot: snapshotAt(0.001), mode: 'live' };
    await runSweep();

    expect(kindsFired()).toContain('STOP_HIT');
  });

  it('says nothing while price sits between the stop and the next rung', async () => {
    // The quiet case matters most: an engine that alerts on every sweep is an
    // engine nobody keeps notifications on for.
    openPositions = [position({ markStopUsd: 0.001, markNextRungUsd: 0.002 })];
    snapshotResult = { snapshot: snapshotAt(0.0015), mode: 'live' };
    await runSweep();

    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('cannot alert on a position it has never marked', async () => {
    // First sweep after the position is added: there is no earlier level, so
    // nothing has been crossed however far the price has moved since entry.
    openPositions = [position()];
    snapshotResult = { snapshot: snapshotAt(1e-9), mode: 'live' };
    await runSweep();

    expect(kindsFired()).not.toContain('STOP_HIT');
    expect(kindsFired()).not.toContain('RUNG_HIT');
  });

  it('never compares price against a stop derived from that same price', async () => {
    /*
     * The bug this file was written for. The sweep used to rebuild the ladder
     * from the current snapshot and compare the current price against it — but
     * resolveHardStop returns spot * (1 - band) with band at least 0.15, so
     * "price <= stop" reduced to "1 <= 0.85" and STOP_HIT could never fire at
     * any price whatsoever. This walks seven orders of magnitude to prove the
     * comparison is against the stored level and not a self-referential one.
     */
    for (const price of [1e-9, 1e-6, 1e-3, 1, 1e3]) {
      alertCreate.mockReset();
      openPositions = [position({ markStopUsd: price * 2 })];
      snapshotResult = { snapshot: snapshotAt(price), mode: 'live' };
      await runSweep();
      expect(kindsFired()).toContain('STOP_HIT');
    }
  });

  it('lets a broken stop supersede every other alert on that token', async () => {
    openPositions = [position({ markStopUsd: 0.001, markNextRungUsd: 1e-12 })];
    snapshotResult = { snapshot: snapshotAt(0.0009), mode: 'live' };
    await runSweep();

    expect(kindsFired()).toEqual(['STOP_HIT']);
  });

  it('raises a rung alert when price reaches the target it was last given', async () => {
    openPositions = [position({ markNextRungUsd: 0.002, markNextRungFraction: 0.31 })];
    snapshotResult = { snapshot: snapshotAt(0.0025), mode: 'live' };
    await runSweep();

    expect(kindsFired()).toContain('RUNG_HIT');
    expect(messageFor('RUNG_HIT')).toMatch(/31% rung filled/i);
  });

  it('names the rung generically when the fraction was never recorded', async () => {
    openPositions = [position({ markNextRungUsd: 0.002, markNextRungFraction: null })];
    snapshotResult = { snapshot: snapshotAt(0.0025), mode: 'live' };
    await runSweep();

    expect(messageFor('RUNG_HIT')).toMatch(/^A rung filled/);
  });

  it('suppresses a repeat of the same kind inside the cooldown window', async () => {
    // Without this the sweep re-alerts on every pass for as long as the
    // condition holds, which for a broken stop is until the position is closed.
    alertFindFirst.mockResolvedValue({ id: 'existing' });
    openPositions = [position({ markStopUsd: 0.001 })];
    snapshotResult = { snapshot: snapshotAt(0.0009), mode: 'live' };
    const res = await runSweep();

    expect(alertCreate).not.toHaveBeenCalled();
    expect(res.alertsFired).toBe(0);
  });

  it('never alerts from a synthetic snapshot', async () => {
    // Demo data reaching a real user's phone as a stop alert would be the
    // worst bug in the app.
    openPositions = [position({ markStopUsd: 0.001 })];
    const s = snapshotAt(0.0009);
    s.dataQuality.synthetic = true;
    snapshotResult = { snapshot: s, mode: 'demo' };
    await runSweep();

    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('never alerts when the snapshot could not be fetched', async () => {
    // A provider outage must not read as "price went to zero, stop broken".
    snapshotResult = null;
    await runSweep();

    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('addresses each alert to the position that raised it', async () => {
    snapshotResult = { snapshot: snapshotAt(0.0009), mode: 'live' };
    openPositions = [position({ id: 'pos_a', userId: 'user_a', markStopUsd: 0.001 })];
    await runSweep();

    const data = (alertCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.userId).toBe('user_a');
    expect(data.positionId).toBe('pos_a');
    expect(data.tokenAddress).toBe(ADDRESS);
    expect(typeof data.priceUsd).toBe('number');
    expect(data.priceUsd).toBeGreaterThan(0);
  });

  it('alerts every holder of a token separately, not once for the token', async () => {
    snapshotResult = { snapshot: snapshotAt(0.0009), mode: 'live' };
    openPositions = [
      position({ id: 'pos_a', userId: 'user_a', markStopUsd: 0.001 }),
      position({ id: 'pos_b', userId: 'user_b', markStopUsd: 0.001 }),
    ];
    await runSweep();

    const users = alertCreate.mock.calls.map(
      (c) => (c[0] as { data: { userId: string } }).data.userId,
    );
    expect(new Set(users)).toEqual(new Set(['user_a', 'user_b']));
  });
});

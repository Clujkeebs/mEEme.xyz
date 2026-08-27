import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDemoSnapshot } from '@/lib/providers/demo';
import type { TokenSnapshot } from '@/lib/engine/types';

/**
 * The sweep is what makes a mark exist. Everything the dashboard shows about
 * an open position — value, unrealized PnL, distance to the stop — is read
 * back from a row this job writes, so a sweep that silently stops writing
 * marks would leave the whole readout frozen at whatever it last said, with
 * nothing in the UI to reveal it.
 *
 * The providers are mocked because the point here is the persistence, not the
 * network.
 */

const ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

const positionUpdate = vi.fn();
const alertCreate = vi.fn();
const watchUpdate = vi.fn();
let snapshotResult: { snapshot: TokenSnapshot; mode: 'live' | 'demo' } | null = null;
let openPositions: unknown[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    watch: { findMany: vi.fn(async () => []), update: (...a: unknown[]) => watchUpdate(...a) },
    position: {
      findMany: vi.fn(async () => openPositions),
      update: (...a: unknown[]) => positionUpdate(...a),
    },
    alert: { create: (...a: unknown[]) => alertCreate(...a), findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/cache', () => ({ writeCachedSnapshot: vi.fn(async () => {}) }));
vi.mock('@/lib/notify', () => ({
  flushPendingAlerts: vi.fn(async () => ({ sent: 0, failed: 0, held: 0 })),
}));
vi.mock('@/lib/providers', () => ({ buildSnapshot: vi.fn(async () => snapshotResult) }));

const { runSweep } = await import('@/lib/jobs');

function livePosition(over: Record<string, unknown> = {}) {
  return {
    id: 'pos_1',
    userId: 'user_1',
    tokenAddress: ADDRESS,
    size: 1_000_000,
    entryPriceUsd: 0.00001,
    ...over,
  };
}

beforeEach(() => {
  positionUpdate.mockReset();
  alertCreate.mockReset();
  watchUpdate.mockReset();
  const snapshot = buildDemoSnapshot(ADDRESS, Date.UTC(2026, 7, 27, 12, 0, 0));
  // buildDemoSnapshot flags itself synthetic; a live sweep is what we model.
  snapshot.dataQuality.synthetic = false;
  snapshotResult = { snapshot, mode: 'live' };
  openPositions = [livePosition()];
});

describe('runSweep position marks', () => {
  it('writes a mark for every open position it snapshots', async () => {
    await runSweep();

    expect(positionUpdate).toHaveBeenCalledTimes(1);
    const call = positionUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where.id).toBe('pos_1');
    expect(call.data.markPriceUsd).toBe(snapshotResult!.snapshot.priceUsd);
    expect(call.data.markedAt).toBeInstanceOf(Date);
    expect((call.data.markedAt as Date).getTime()).toBe(snapshotResult!.snapshot.fetchedAtMs);
    expect(typeof call.data.markVerdict).toBe('string');
    expect(typeof call.data.markCoilScore).toBe('number');
  });

  it('marks the position even when the engine produces no ladder', async () => {
    // A position with no ladder still has a price, and "what is it worth" must
    // not depend on whether the engine had enough to build an exit plan.
    openPositions = [livePosition({ size: 0, entryPriceUsd: 0 })];
    await runSweep();

    expect(positionUpdate).toHaveBeenCalledTimes(1);
    const data = (positionUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.markPriceUsd).toBe(snapshotResult!.snapshot.priceUsd);
  });

  it('never marks from a synthetic snapshot', async () => {
    // Demo data reaching a real dashboard as a real mark would be a lie about
    // someone's money.
    snapshotResult = { snapshot: snapshotResult!.snapshot, mode: 'demo' };
    await runSweep();
    expect(positionUpdate).not.toHaveBeenCalled();
  });

  it('never marks when the snapshot fetch failed', async () => {
    snapshotResult = null;
    await runSweep();
    expect(positionUpdate).not.toHaveBeenCalled();
  });

  it('records the next rung above the mark, not one already filled', async () => {
    await runSweep();
    const data = (positionUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    const rung = data.markNextRungUsd as number | null;
    if (rung !== null) {
      expect(rung).toBeGreaterThan(snapshotResult!.snapshot.priceUsd);
      expect(data.markNextRungFraction).toBeTypeOf('number');
    }
  });
});

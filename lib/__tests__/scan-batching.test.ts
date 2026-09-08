import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate } from '@/lib/providers/discover';
import type { TokenSnapshot } from '@/lib/engine/types';
import { buildDemoSnapshot } from '@/lib/providers/demo';

/**
 * How many tokens a scan pass actually calls.
 *
 * The scanner used to ask discovery for exactly the twelve it meant to call and
 * then drop whichever were inside the six-hour rescan cooldown. Discovery ranks
 * by churn and that ranking is stable between passes, so the first pass called
 * the top twelve and the next twelve passes — six hours of them, every half
 * hour — found the same twelve on cooldown and did nothing, while candidates
 * ranked thirteenth and below went untouched. The public ledger is the entire
 * trust argument and it was growing at about one call an hour because of it.
 */

const recordSignal = vi.fn(async () => ({ slug: 's' }));
const signalFindMany = vi.fn(async () => [] as { tokenAddress: string }[]);
let discovered: Candidate[] = [];
let snapshots = new Map<string, TokenSnapshot>();

vi.mock('@/lib/db', () => ({
  prisma: {
    watch: { findMany: vi.fn(async () => []), update: vi.fn(async () => {}) },
    position: { findMany: vi.fn(async () => []), update: vi.fn(async () => {}) },
    alert: { create: vi.fn(async () => {}), findFirst: vi.fn(async () => null) },
    signal: {
      findMany: (...a: unknown[]) => signalFindMany(...(a as [])),
      update: vi.fn(async () => {}),
    },
  },
}));
vi.mock('@/lib/cache', () => ({ writeCachedSnapshot: vi.fn(async () => {}) }));
vi.mock('@/lib/notify', () => ({
  flushPendingAlerts: vi.fn(async () => ({ sent: 0, failed: 0, held: 0 })),
}));
vi.mock('@/lib/signal-store', async (orig) => ({
  ...(await orig<typeof import('@/lib/signal-store')>()),
  recordSignal: (...a: unknown[]) => recordSignal(...(a as [])),
}));
vi.mock('@/lib/providers/discover', async (orig) => ({
  ...(await orig<typeof import('@/lib/providers/discover')>()),
  discoverCandidates: vi.fn(async (limit: number) => discovered.slice(0, limit)),
}));
vi.mock('@/lib/providers', () => ({
  buildSnapshot: vi.fn(async (address: string) => {
    const snapshot = snapshots.get(address);
    return snapshot ? { snapshot, mode: 'live' as const, sources: ['x'], missing: [] } : null;
  }),
}));

const { runScan } = await import('@/lib/jobs');

/** A candidate the engine will happily call: deep enough, confident enough. */
function candidate(i: number): Candidate {
  return {
    address: `MINT${String(i).padStart(40, '0')}`,
    symbol: `T${i}`,
    liquidityUsd: 200_000,
    volumeH24Usd: 900_000,
    ageMinutes: 600,
  };
}

function poolOf(n: number): Candidate[] {
  const out: Candidate[] = [];
  snapshots = new Map();
  for (let i = 0; i < n; i++) {
    const c = candidate(i);
    const s = buildDemoSnapshot(c.address, Date.UTC(2026, 8, 8, 12, 0, 0));
    s.dataQuality.synthetic = false;
    s.liquidityUsd = c.liquidityUsd;
    // Confidence must clear the track-record floor or the call is not recorded.
    s.dataQuality.supplyCovered = 0.9;
    snapshots.set(c.address, s);
    out.push(c);
  }
  return out;
}

beforeEach(() => {
  recordSignal.mockReset();
  recordSignal.mockResolvedValue({ slug: 's' });
  signalFindMany.mockReset();
  signalFindMany.mockResolvedValue([]);
  discovered = poolOf(60);
});

describe('runScan batching', () => {
  it('asks discovery for far more candidates than it intends to call', async () => {
    const { discoverCandidates } = await import('@/lib/providers/discover');
    await runScan();
    const askedFor = (discoverCandidates as unknown as { mock: { calls: number[][] } }).mock
      .calls[0]?.[0];
    expect(askedFor).toBeGreaterThan(12);
  });

  it('calls a bounded batch, so a pass costs what it always did', async () => {
    await runScan();
    expect(recordSignal.mock.calls.length).toBeLessThanOrEqual(12);
    expect(recordSignal.mock.calls.length).toBeGreaterThan(0);
  });

  it('falls through to fresh names when its best ones are on cooldown', async () => {
    // The regression this exists for: with the top twelve all recently called,
    // the old scanner did nothing for six hours. It should now reach past them.
    signalFindMany.mockResolvedValue(discovered.slice(0, 12).map((c) => ({ tokenAddress: c.address })));
    const res = await runScan();

    expect(res.called).toBeGreaterThan(0);
    const calledAddresses = new Set(
      (recordSignal.mock.calls as unknown as { snapshot: { address: string } }[][]).map(
        (c) => c[0]!.snapshot.address,
      ),
    );
    for (const c of discovered.slice(0, 12)) {
      expect(calledAddresses.has(c.address)).toBe(false);
    }
  });

  it('does nothing when the whole pool is on cooldown, rather than re-calling', async () => {
    signalFindMany.mockResolvedValue(discovered.map((c) => ({ tokenAddress: c.address })));
    const res = await runScan();

    expect(res.called).toBe(0);
    expect(recordSignal).not.toHaveBeenCalled();
    expect(res.skipped.recentlyCalled).toBe(discovered.length);
  });

  it('still reports the full pool it considered, not just the batch', async () => {
    const res = await runScan();
    expect(res.considered).toBe(discovered.length);
    expect(res.considered).toBeGreaterThan(res.called);
  });

  it('handles a pool smaller than a batch without over-reaching', async () => {
    discovered = poolOf(4);
    const res = await runScan();
    expect(res.called).toBeLessThanOrEqual(4);
  });

  it('returns cleanly when discovery finds nothing at all', async () => {
    discovered = [];
    const res = await runScan();
    expect(res).toEqual({
      considered: 0,
      called: 0,
      skipped: { recentlyCalled: 0, noLiveData: 0, tooThin: 0, lowConfidence: 0 },
    });
  });
});

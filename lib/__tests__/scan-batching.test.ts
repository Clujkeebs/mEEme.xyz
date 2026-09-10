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

const recordSignal = vi.fn(async (): Promise<{ slug: string } | null> => ({ slug: 's' }));
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
  SCAN_WALLET_BUDGET: 8,
  buildSnapshot: vi.fn(async (address: string) => {
    const snapshot = snapshots.get(address);
    return snapshot ? { snapshot, mode: 'live' as const, sources: ['x'], missing: [] } : null;
  }),
}));

const { runScan, summarizeCoil, __resetUnresolvable } = await import('@/lib/jobs');

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
  __resetUnresolvable();
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
      skipped: {
        recentlyCalled: 0, noLiveData: 0, tooThin: 0, lowConfidence: 0, noVerdict: 0, unresolvable: 0,
      },
      declinedCoil: null,
      lowConfidenceDetail: [],
    });
  });
});

describe('runScan counts outcomes, not attempts', () => {
  it('does not count a signal the store declined to publish', async () => {
    /*
     * recordSignal returns null for a NO_SIGNAL from the scanner, because a
     * refusal to call cannot be graded and would only pad the ledger. This used
     * to increment `called` anyway, so once the entry calls were retired — and
     * most scanned tokens correctly became NO_SIGNAL — the job logged five
     * calls a pass while a single row reached the database. The number was
     * trusted, and it sent a whole investigation to the wrong place.
     */
    recordSignal.mockResolvedValue(null);
    const res = await runScan();

    expect(recordSignal.mock.calls.length).toBeGreaterThan(0);
    expect(res.called).toBe(0);
    expect(res.skipped.noVerdict).toBe(recordSignal.mock.calls.length);
  });

  it('counts a mix correctly', async () => {
    let n = 0;
    recordSignal.mockImplementation(async () => (n++ % 2 === 0 ? { slug: 's' } : null));
    const res = await runScan();

    const attempts = recordSignal.mock.calls.length;
    expect(attempts).toBeGreaterThan(1);
    expect(res.called + res.skipped.noVerdict).toBe(attempts);
    expect(res.called).toBeGreaterThan(0);
    expect(res.skipped.noVerdict).toBeGreaterThan(0);
  });

  it('never reports more calls than rows the store accepted', async () => {
    const res = await runScan();
    const accepted = (await Promise.all(recordSignal.mock.results.map((r) => r.value))).filter(Boolean).length;
    expect(res.called).toBe(accepted);
  });
});

describe('summarizeCoil', () => {
  it('reports nothing when nothing was declined', () => {
    expect(summarizeCoil([])).toBeNull();
  });

  it('distinguishes a quiet market from a threshold that is deciding', () => {
    // The whole point of the field. These two sets have the same count and
    // want opposite responses.
    const quiet = summarizeCoil([0.01, 0.03, 0.04, 0.05, 0.07])!;
    const stacked = summarizeCoil([0.24, 0.26, 0.27, 0.275, 0.279])!;
    expect(quiet.median).toBeLessThan(0.1);
    expect(stacked.median).toBeGreaterThan(0.25);
    expect(stacked.max).toBeLessThan(0.28);
  });

  it('takes the middle of an even-length set rather than one side of it', () => {
    expect(summarizeCoil([0.1, 0.2, 0.3, 0.4])!.median).toBeCloseTo(0.25, 6);
  });

  it('does not care what order the scores arrived in', () => {
    const a = summarizeCoil([0.3, 0.1, 0.2]);
    const b = summarizeCoil([0.1, 0.2, 0.3]);
    expect(a).toEqual(b);
    expect(a).toEqual({ min: 0.1, median: 0.2, max: 0.3 });
  });

  it('handles a single decline', () => {
    expect(summarizeCoil([0.123456])).toEqual({ min: 0.123, median: 0.123, max: 0.123 });
  });
});

describe('unresolvable tokens are held back', () => {
  /**
   * A read that fails the confidence floor is never recorded as a Signal, and
   * the rescan cooldown is derived from Signal rows — so nothing stopped the
   * scanner picking the same unresolvable token again on the very next pass,
   * and again half an hour later, forever. Production showed the identical
   * "volume-profile:0.14/0.03" entries repeating pass after pass, each costing
   * a batch slot and up to sixty paced Helius calls to reach the same answer.
   */
  it('does not re-read a token whose float could not be resolved', async () => {
    // Confidence is built from the distribution, not from dataQuality, so the
    // way to reproduce production here is to leave it nothing to build from:
    // no holders and no candles gives method 'none' and the 0.05 floor.
    for (const s of snapshots.values()) {
      s.holders = [];
      s.candles = [];
    }
    const first = await runScan();
    expect(first.skipped.lowConfidence).toBeGreaterThan(0);
    expect(first.skipped.unresolvable).toBe(0);

    const second = await runScan();
    expect(second.skipped.unresolvable).toBeGreaterThan(0);
  });

  it('leaves a quiet token eligible, because quiet is not a failure', async () => {
    /*
     * NO_SIGNAL means the market has nothing to say right now, and that can
     * change inside the half hour. Cooling those down would make the scanner
     * blind to exactly the move it exists to catch — only unresolvable reads
     * are held back.
     */
    recordSignal.mockResolvedValue(null);
    await runScan();
    const second = await runScan();

    expect(second.skipped.noVerdict).toBeGreaterThan(0);
    expect(second.skipped.unresolvable).toBe(0);
  });

  it('counts a held-back token separately from one it actually called', async () => {
    for (const s of snapshots.values()) {
      s.holders = [];
      s.candles = [];
    }
    await runScan();
    const second = await runScan();

    // recentlyCalled is "we published this"; unresolvable is "we could not".
    expect(second.skipped.recentlyCalled).toBe(0);
    expect(second.skipped.unresolvable).toBeGreaterThan(0);
  });

  it('starts clean again once the hold is reset', async () => {
    for (const s of snapshots.values()) {
      s.holders = [];
      s.candles = [];
    }
    await runScan();
    __resetUnresolvable();
    const after = await runScan();
    expect(after.skipped.unresolvable).toBe(0);
  });
});

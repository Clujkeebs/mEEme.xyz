import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These test the safety properties, not the happy path. Error capture runs
 * during incidents; the ways it can make one worse are what matter.
 */

const upsert = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { errorEvent: { upsert: (...a: unknown[]) => upsert(...a) } } }));

const { captureErrorAsync, fingerprintOf, __resetCaptureState } = await import('@/lib/observability');

beforeEach(() => {
  upsert.mockReset();
  upsert.mockResolvedValue({});
  __resetCaptureState();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('fingerprintOf', () => {
  it('collapses varying ids and numbers into one fault', () => {
    // The same failure against a thousand tokens must be one row, not a
    // thousand — this is the whole thing that keeps a hot loop survivable.
    const a = fingerprintOf('provider', 'fetch failed for 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr after 3 tries');
    const b = fingerprintOf('provider', 'fetch failed for DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 after 9 tries');
    expect(a).toBe(b);
  });

  it('keeps genuinely different faults apart', () => {
    expect(fingerprintOf('provider', 'timed out')).not.toBe(fingerprintOf('provider', 'unauthorized'));
    // Same message from different places is different information.
    expect(fingerprintOf('cron:sweep', 'timed out')).not.toBe(fingerprintOf('cron:scan', 'timed out'));
  });
});

describe('captureError bounds', () => {
  it('writes once, then throttles repeats of the same fault', async () => {
    for (let i = 0; i < 50; i++) await captureErrorAsync('cron:sweep', new Error('boom'));
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  /** Total occurrences the database was told about, across every write. */
  function recordedTotal(): number {
    return upsert.mock.calls.reduce((sum, call) => {
      const arg = call[0] as {
        create?: { count?: number };
        update?: { count?: { increment?: number } };
      };
      return sum + (arg.update?.count?.increment ?? arg.create?.count ?? 0);
    }, 0);
  }

  it('accounts for every occurrence, however the writes are batched', async () => {
    // The invariant is conservation, not a particular number of writes: how
    // many statements it takes is an implementation detail, losing an
    // occurrence is a lie on a dashboard.
    for (let i = 0; i < 5; i++) await captureErrorAsync('cron:sweep', new Error('boom'));
    await vi.advanceTimersByTimeAsync(11_000);
    await captureErrorAsync('cron:sweep', new Error('boom'));
    await vi.advanceTimersByTimeAsync(11_000);

    expect(recordedTotal()).toBe(6);
  });

  it('flushes suppressed occurrences even if the burst then stops', async () => {
    // The bug this catches: a tight loop that ends inside the throttle window
    // used to record "1" for 500 failures, because the count was only flushed
    // by the *next* capture. A number that reads as precise and is wrong by
    // 499 is worse than no number.
    for (let i = 0; i < 500; i++) await captureErrorAsync('sweep', new Error(`failed for tok-${i}`));
    // One write for 500 failures — the bound that keeps a hot loop survivable.
    expect(upsert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(11_000);
    // ...and the other 499 still arrive, without 499 more writes.
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(recordedTotal()).toBe(500);
  });

  it('never throws when the database is down', async () => {
    upsert.mockRejectedValue(new Error('connection refused'));
    await expect(captureErrorAsync('cron:sweep', new Error('boom'))).resolves.toBeUndefined();
  });

  it('stops writing after repeated failures, so it cannot pile onto an outage', async () => {
    upsert.mockRejectedValue(new Error('connection refused'));
    // Distinct messages so the throttle is not what stops it.
    for (let i = 0; i < 5; i++) await captureErrorAsync('scope', new Error(`fault ${String.fromCharCode(97 + i)}`));
    expect(upsert).toHaveBeenCalledTimes(5);

    upsert.mockClear();
    await captureErrorAsync('scope', new Error('another distinct fault'));
    expect(upsert).not.toHaveBeenCalled();

    // ...and recovers once the circuit window passes.
    vi.advanceTimersByTime(61_000);
    upsert.mockResolvedValue({});
    await captureErrorAsync('scope', new Error('yet another distinct fault'));
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('clears a recurrence back to unresolved', async () => {
    await captureErrorAsync('cron:sweep', new Error('boom'));
    const call = upsert.mock.calls[0]![0] as { update: { resolvedAt: null } };
    expect(call.update.resolvedAt).toBeNull();
  });

  it('truncates oversized stacks and context rather than storing them whole', async () => {
    const err = new Error('boom');
    err.stack = 'x'.repeat(50_000);
    await captureErrorAsync('scope', err, { blob: 'y'.repeat(50_000) });
    const call = upsert.mock.calls[0]![0] as { create: { stack: string; context: string } };
    expect(call.create.stack.length).toBeLessThanOrEqual(4_000);
    expect(call.create.context.length).toBeLessThanOrEqual(2_000);
  });

  it('handles a thrown non-Error without blowing up', async () => {
    await expect(captureErrorAsync('scope', { weird: true })).resolves.toBeUndefined();
    await expect(captureErrorAsync('scope', 'a string')).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});

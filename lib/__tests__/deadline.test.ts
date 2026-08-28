import { describe, expect, it, vi } from 'vitest';
import { withDeadline } from '@/lib/deadline';

describe('withDeadline', () => {
  it('returns the value when the work finishes in time', async () => {
    await expect(withDeadline(Promise.resolve('live'), 1_000)).resolves.toBe('live');
  });

  it('gives up with null rather than waiting forever', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<string>(() => {});
      const raced = withDeadline(never, 12_000);
      await vi.advanceTimersByTimeAsync(12_001);
      await expect(raced).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a failure as no answer, not as a thrown error', async () => {
    // Callers render a page. A provider being down must degrade to the
    // fallback, never to a 500.
    await expect(withDeadline(Promise.reject(new Error('502')), 1_000)).resolves.toBeNull();
  });

  it('does not leave an abandoned rejection unhandled', async () => {
    // The real hazard: the losing promise rejects *after* the deadline, with
    // nothing attached to it. In Node that terminates the process by default,
    // which would turn a slow provider into a crashed server.
    vi.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const late = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('too late')), 50_000);
      });
      const raced = withDeadline(late, 12_000);
      await vi.advanceTimersByTimeAsync(12_001);
      expect(await raced).toBeNull();
      await vi.advanceTimersByTimeAsync(40_000);
      await Promise.resolve();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      vi.useRealTimers();
    }
  });
});

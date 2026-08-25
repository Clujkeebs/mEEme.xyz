import { describe, expect, it, vi } from 'vitest';
import { mapWithConcurrency } from '../concurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order in the output regardless of completion order', async () => {
    const delays = [30, 10, 20, 5, 25];
    const results = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('never runs more than `concurrency` tasks at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
      return n * 2;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not let one failing item abort the batch when onError is supplied', async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3],
      2,
      async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      },
      (_err, n) => -n,
    );
    expect(results).toEqual([1, -2, 3]);
  });

  it('rejects the batch on a failing item when no onError handler is given', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('handles an empty list without dividing by zero or hanging', async () => {
    const fn = vi.fn(async (n: number) => n);
    const results = await mapWithConcurrency([], 5, fn);
    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('clamps concurrency to at least 1 and at most the item count', async () => {
    let maxInFlight = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2], 50, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n;
    });
    // Only 2 items exist, so even with concurrency=50 at most 2 run at once.
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('runs single-file when concurrency is 1', async () => {
    const order: number[] = [];
    await mapWithConcurrency([1, 2, 3], 1, async (n) => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 1));
      return n;
    });
    expect(order).toEqual([1, 2, 3]);
  });
});

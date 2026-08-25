import { describe, expect, it } from 'vitest';
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

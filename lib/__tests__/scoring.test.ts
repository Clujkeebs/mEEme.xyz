import { describe, expect, it } from 'vitest';
import { gradeSignal, summarize } from '../scoring';

const g = (verdict: Parameters<typeof gradeSignal>[0]['verdict'], from: number, to: number, max?: number, min?: number) =>
  gradeSignal({ verdict, priceAtSignal: from, priceAtHorizon: to, maxPrice: max ?? null, minPrice: min ?? null });

describe('gradeSignal', () => {
  it('credits an exit call when price fell', () => {
    const r = g('EXIT_IMMEDIATELY', 100, 70);
    expect(r.grade).toBe('correct');
    expect(r.edgePct).toBeCloseTo(0.3, 6);
  });

  it('penalises an exit call that missed a run', () => {
    const r = g('SCALE_OUT_NOW', 100, 200);
    expect(r.grade).toBe('incorrect');
    expect(r.edgePct).toBeCloseTo(-1, 6);
  });

  it('refuses to score noise as a win', () => {
    expect(g('EXIT_IMMEDIATELY', 100, 97).grade).toBe('neutral');
    expect(g('APEX_ENTRY', 100, 103).grade).toBe('neutral');
  });

  it('credits an entry call when price rose', () => {
    const r = g('APEX_ENTRY', 100, 160);
    expect(r.grade).toBe('correct');
    expect(r.edgePct).toBeCloseTo(0.6, 6);
  });

  it('penalises an entry call that bled out', () => {
    expect(g('SCALE_IN', 100, 60).grade).toBe('incorrect');
  });

  it('vindicates a warning by the drawdown it warned about', () => {
    // Price recovered to flat, but it went to -30% first. The warning was right.
    const r = g('ARM_EXIT', 100, 100, 105, 70);
    expect(r.grade).toBe('correct');
    expect(r.edgePct).toBeCloseTo(0.3, 6);
  });

  it('penalises a warning on a token that just ran', () => {
    expect(g('ARM_EXIT', 100, 250, 260, 99).grade).toBe('incorrect');
  });

  it('marks a HOLD wrong when holding actually hurt', () => {
    expect(g('HOLD_THROUGH_NOISE', 100, 70).grade).toBe('incorrect');
  });

  it('marks a HOLD right when it caught a move', () => {
    expect(g('HOLD_THROUGH_NOISE', 100, 105, 130, 95).grade).toBe('correct');
  });

  it('stays pending without a horizon price', () => {
    expect(gradeSignal({ verdict: 'SCALE_IN', priceAtSignal: 100, priceAtHorizon: null, maxPrice: null, minPrice: null }).grade).toBe('pending');
  });

  it('stays pending on a nonsensical signal price', () => {
    expect(gradeSignal({ verdict: 'SCALE_IN', priceAtSignal: 0, priceAtHorizon: 10, maxPrice: null, minPrice: null }).grade).toBe('pending');
  });
});

describe('summarize', () => {
  it('excludes neutral calls from accuracy rather than counting them as wins', () => {
    const s = summarize([
      { grade: 'correct', edgePct: 0.2 },
      { grade: 'incorrect', edgePct: -0.1 },
      { grade: 'neutral', edgePct: 0.01 },
      { grade: 'pending', edgePct: null },
    ]);
    expect(s.total).toBe(4);
    expect(s.accuracy).toBeCloseTo(0.5, 6);
    expect(s.neutral).toBe(1);
    expect(s.pending).toBe(1);
  });

  it('returns null accuracy rather than 0 when nothing is decided', () => {
    expect(summarize([{ grade: 'pending', edgePct: null }]).accuracy).toBeNull();
  });

  it('averages edge only over graded calls', () => {
    const s = summarize([
      { grade: 'correct', edgePct: 0.4 },
      { grade: 'incorrect', edgePct: -0.2 },
      { grade: 'pending', edgePct: null },
    ]);
    expect(s.averageEdgePct).toBeCloseTo(0.1, 6);
  });

  it('handles an empty ledger', () => {
    const s = summarize([]);
    expect(s.total).toBe(0);
    expect(s.accuracy).toBeNull();
    expect(s.averageEdgePct).toBeNull();
  });
});

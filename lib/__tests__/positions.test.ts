import { describe, expect, it } from 'vitest';
import {
  MARK_STALE_AFTER_MS,
  summarizePortfolio,
  valuePosition,
  type MarkablePosition,
} from '@/lib/positions';

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);

function position(over: Partial<MarkablePosition> = {}): MarkablePosition {
  return {
    size: 1_000,
    entryPriceUsd: 0.01,
    markPriceUsd: 0.015,
    markedAt: new Date(NOW - 60_000).toISOString(),
    markVerdict: 'ARM_EXIT',
    markCoilScore: 0.5,
    markStopUsd: 0.012,
    markNextRungUsd: 0.02,
    markNextRungFraction: 0.25,
    ...over,
  };
}

describe('valuePosition', () => {
  it('values a marked position', () => {
    const v = valuePosition(position(), NOW);
    expect(v.marked).toBe(true);
    expect(v.costUsd).toBe(10);
    expect(v.valueUsd).toBe(15);
    expect(v.unrealizedPnlUsd).toBeCloseTo(5, 10);
    expect(v.unrealizedPnlPct).toBeCloseTo(0.5, 10);
  });

  it('reports a loss as a loss', () => {
    const v = valuePosition(position({ markPriceUsd: 0.004, markStopUsd: null }), NOW);
    expect(v.unrealizedPnlUsd).toBeCloseTo(-6, 10);
    expect(v.unrealizedPnlPct).toBeCloseTo(-0.6, 10);
  });

  it('distinguishes never-marked from a mark of zero', () => {
    const never = valuePosition(position({ markPriceUsd: null, markedAt: null }), NOW);
    expect(never.marked).toBe(false);
    expect(never.valueUsd).toBeNull();
    expect(never.unrealizedPnlUsd).toBeNull();
    // Cost is knowable without a mark and is still reported.
    expect(never.costUsd).toBe(10);
  });

  it('treats a non-finite or non-positive mark as no mark', () => {
    expect(valuePosition(position({ markPriceUsd: 0 }), NOW).marked).toBe(false);
    expect(valuePosition(position({ markPriceUsd: Number.NaN }), NOW).marked).toBe(false);
    expect(valuePosition(position({ markPriceUsd: -1 }), NOW).marked).toBe(false);
  });

  it('measures the drop to the stop, and flags a broken stop instead of 0%', () => {
    const ok = valuePosition(position({ markPriceUsd: 0.02, markStopUsd: 0.015 }), NOW);
    expect(ok.stopBroken).toBe(false);
    expect(ok.stopDistancePct).toBeCloseTo(0.25, 10);

    // Price at or below the stop is a different situation, not a small distance.
    const broken = valuePosition(position({ markPriceUsd: 0.01, markStopUsd: 0.012 }), NOW);
    expect(broken.stopBroken).toBe(true);
    expect(broken.stopDistancePct).toBeNull();

    const exactly = valuePosition(position({ markPriceUsd: 0.012, markStopUsd: 0.012 }), NOW);
    expect(exactly.stopBroken).toBe(true);
  });

  it('only reports a rung that is still above the mark', () => {
    expect(valuePosition(position({ markPriceUsd: 0.015, markNextRungUsd: 0.03 }), NOW)
      .nextRungDistancePct).toBeCloseTo(1, 10);
    // A rung at or below the mark is already filled — not "0% away".
    expect(valuePosition(position({ markPriceUsd: 0.03, markNextRungUsd: 0.02 }), NOW)
      .nextRungDistancePct).toBeNull();
  });

  it('goes stale once the sweep stops touching it', () => {
    const fresh = valuePosition(position(), NOW);
    expect(fresh.stale).toBe(false);

    const old = valuePosition(
      position({ markedAt: new Date(NOW - MARK_STALE_AFTER_MS - 1).toISOString() }),
      NOW,
    );
    expect(old.stale).toBe(true);
    expect(old.markAgeMs).toBeGreaterThan(MARK_STALE_AFTER_MS);
  });

  it('never reports a negative age when a mark timestamp runs ahead of the clock', () => {
    const v = valuePosition(position({ markedAt: new Date(NOW + 30_000).toISOString() }), NOW);
    expect(v.markAgeMs).toBe(0);
    expect(v.stale).toBe(false);
  });
});

describe('summarizePortfolio', () => {
  it('excludes unmarked positions from value but counts them', () => {
    const s = summarizePortfolio(
      [position(), position({ markPriceUsd: null, markedAt: null, size: 500 })],
      [],
      NOW,
    );
    expect(s.openCount).toBe(2);
    expect(s.unmarkedCount).toBe(1);
    // Cost covers both; value and PnL only the one we could mark.
    expect(s.openCostUsd).toBe(15);
    expect(s.markedCostUsd).toBe(10);
    expect(s.markedValueUsd).toBe(15);
    expect(s.unrealizedPnlUsd).toBe(5);
    expect(s.unrealizedPnlPct).toBeCloseTo(0.5, 10);
  });

  it('has no unrealized percentage when nothing is marked', () => {
    const s = summarizePortfolio([position({ markPriceUsd: null, markedAt: null })], [], NOW);
    expect(s.unrealizedPnlPct).toBeNull();
    expect(s.unrealizedPnlUsd).toBe(0);
  });

  it('dates the readout by its oldest mark and flags staleness', () => {
    const s = summarizePortfolio(
      [
        position({ markedAt: new Date(NOW - 60_000).toISOString() }),
        position({ markedAt: new Date(NOW - MARK_STALE_AFTER_MS - 60_000).toISOString() }),
      ],
      [],
      NOW,
    );
    expect(s.oldestMarkAgeMs).toBeGreaterThan(MARK_STALE_AFTER_MS);
    expect(s.anyStale).toBe(true);
  });

  it('computes win rate over decided trades, not all trades', () => {
    // A scratch (exactly zero) is neither a win nor a loss; counting it as a
    // loss would understate the record.
    const s = summarizePortfolio([], [
      { realizedPnlUsd: 12 },
      { realizedPnlUsd: -4 },
      { realizedPnlUsd: 0 },
    ], NOW);
    expect(s.closedCount).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBe(0.5);
    expect(s.realizedPnlUsd).toBe(8);
    expect(s.bestUsd).toBe(12);
    expect(s.worstUsd).toBe(-4);
  });

  it('ignores closed trades with no recorded PnL', () => {
    const s = summarizePortfolio([], [{ realizedPnlUsd: null }, { realizedPnlUsd: 5 }], NOW);
    expect(s.realizedPnlUsd).toBe(5);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBe(1);
  });

  it('has no win rate before anything is closed', () => {
    const s = summarizePortfolio([position()], [], NOW);
    expect(s.winRate).toBeNull();
    expect(s.bestUsd).toBeNull();
  });
});

describe('sign rendering contract', () => {
  // A loss rendered without its sign reads as a gain — the single most
  // dangerous formatting bug this dashboard can have. These assert the shape
  // the UI depends on rather than the UI itself: PnL is signed, and the row
  // must supply the glyph because the magnitude is printed via Math.abs.
  it('reports losses as negative numbers, not magnitudes', () => {
    const v = valuePosition(position({ markPriceUsd: 0.004 }), NOW);
    expect(v.unrealizedPnlUsd).toBeLessThan(0);
    expect(v.unrealizedPnlPct).toBeLessThan(0);
  });

  it('keeps portfolio totals signed when the book is underwater', () => {
    const s = summarizePortfolio(
      [position({ markPriceUsd: 0.004, size: 1_000, entryPriceUsd: 0.01 })],
      [{ realizedPnlUsd: -80 }],
      NOW,
    );
    expect(s.unrealizedPnlUsd).toBe(-6);
    expect(s.unrealizedPnlPct).toBeLessThan(0);
    expect(s.realizedPnlUsd).toBe(-80);
    expect(s.winRate).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { effectiveTier, tierAtLeast } from '@/lib/tiers';

const HOUR = 60 * 60_000;
const now = new Date('2026-08-26T12:00:00.000Z');
const future = new Date(now.getTime() + 3 * HOUR);
const past = new Date(now.getTime() - 3 * HOUR);

describe('effectiveTier', () => {
  it('returns the real tier when there is no trial', () => {
    expect(effectiveTier('FREE', null, null, now)).toBe('FREE');
    expect(effectiveTier('APEX', null, null, now)).toBe('APEX');
  });

  it('grants an active trial that outranks the real tier', () => {
    expect(effectiveTier('FREE', 'DEGEN', future, now)).toBe('DEGEN');
    expect(effectiveTier('FREE', 'APEX', future, now)).toBe('APEX');
    expect(effectiveTier('DEGEN', 'APEX', future, now)).toBe('APEX');
  });

  it('does not grant a trial for a tier the user already has or beats', () => {
    // A Degen trial must never downgrade an Apex subscriber, or leave a
    // paying Degen subscriber's effective tier ambiguous.
    expect(effectiveTier('APEX', 'DEGEN', future, now)).toBe('APEX');
    expect(effectiveTier('DEGEN', 'DEGEN', future, now)).toBe('DEGEN');
  });

  it('ignores an expired trial', () => {
    expect(effectiveTier('FREE', 'DEGEN', past, now)).toBe('FREE');
  });

  it('treats "right now" as already expired, not still active', () => {
    expect(effectiveTier('FREE', 'DEGEN', now, now)).toBe('FREE');
  });

  it('ignores a malformed trialTier rather than throwing', () => {
    expect(effectiveTier('FREE', 'NOT_A_TIER', future, now)).toBe('FREE');
  });

  it('ignores a trial with only one of the two fields set', () => {
    expect(effectiveTier('FREE', 'DEGEN', null, now)).toBe('FREE');
    expect(effectiveTier('FREE', null, future, now)).toBe('FREE');
  });
});

describe('tierAtLeast', () => {
  it('orders FREE < DEGEN < APEX', () => {
    expect(tierAtLeast('APEX', 'DEGEN')).toBe(true);
    expect(tierAtLeast('DEGEN', 'APEX')).toBe(false);
    expect(tierAtLeast('FREE', 'FREE')).toBe(true);
  });
});

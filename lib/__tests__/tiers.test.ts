import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectiveTier, entitlementFor, tierAtLeast } from '@/lib/tiers';

// entitlementFor reads the price ids from the environment, so each test in that
// block sets them and this puts the process back how it found it.
const REAL_ENV = { degen: process.env.STRIPE_PRICE_DEGEN, apex: process.env.STRIPE_PRICE_APEX };
afterEach(() => {
  if (REAL_ENV.degen === undefined) delete process.env.STRIPE_PRICE_DEGEN;
  else process.env.STRIPE_PRICE_DEGEN = REAL_ENV.degen;
  if (REAL_ENV.apex === undefined) delete process.env.STRIPE_PRICE_APEX;
  else process.env.STRIPE_PRICE_APEX = REAL_ENV.apex;
});

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

describe('entitlementFor', () => {
  const ENTITLING = new Set(['active', 'trialing']);
  const DEGEN_PRICE = 'price_degen_live_123';
  const APEX_PRICE = 'price_apex_live_456';

  beforeEach(() => {
    process.env.STRIPE_PRICE_DEGEN = DEGEN_PRICE;
    process.env.STRIPE_PRICE_APEX = APEX_PRICE;
  });

  it('grants the tier the price is for', () => {
    expect(entitlementFor('active', DEGEN_PRICE, ENTITLING)).toEqual({
      tier: 'DEGEN', recognized: true, problem: null,
    });
    expect(entitlementFor('active', APEX_PRICE, ENTITLING).tier).toBe('APEX');
  });

  it('grants during a trial, because a trial is entitling', () => {
    expect(entitlementFor('trialing', APEX_PRICE, ENTITLING).tier).toBe('APEX');
  });

  it('drops to free on every non-entitling status', () => {
    for (const status of ['canceled', 'unpaid', 'past_due', 'incomplete', 'paused', '']) {
      expect(entitlementFor(status, DEGEN_PRICE, ENTITLING)).toEqual({
        tier: 'FREE', recognized: true, problem: null,
      });
    }
  });

  it('drops to free on a dead subscription even if the price is unrecognized', () => {
    // Not entitled is unambiguous however the price reads, so there is nothing
    // to withhold here — FREE is the correct write.
    expect(entitlementFor('canceled', 'price_from_another_account', ENTITLING).tier).toBe('FREE');
  });

  it('refuses to price an active subscription on an unknown price id', () => {
    /*
     * The bug this replaces. Stripe issues a new price id whenever a price is
     * edited, and test and live mode have entirely separate ones, so this
     * mismatch is an ordinary configuration slip. It used to resolve to FREE
     * and get written to the user row — the customer keeps being charged while
     * their account is stripped to the free tier, and nothing is raised.
     */
    const out = entitlementFor('active', 'price_stale_from_test_mode', ENTITLING);
    expect(out.tier).toBeNull();
    expect(out.recognized).toBe(false);
    expect(out.problem).toMatch(/customer is paying/i);
    expect(out.problem).toMatch(/price_stale_from_test_mode/);
  });

  it('refuses to price an entitling subscription with no price id at all', () => {
    const out = entitlementFor('active', null, ENTITLING);
    expect(out.tier).toBeNull();
    expect(out.problem).toMatch(/unknown/);
  });

  it('does not treat an unset env var as matching a missing price', () => {
    // `undefined === undefined` would hand out a paid tier for free.
    delete process.env.STRIPE_PRICE_DEGEN;
    delete process.env.STRIPE_PRICE_APEX;
    expect(entitlementFor('active', undefined, ENTITLING).tier).toBeNull();
    expect(entitlementFor('active', '', ENTITLING).tier).toBeNull();
  });

  it('never returns a tier and a problem at the same time', () => {
    const cases: [string, string | null][] = [
      ['active', DEGEN_PRICE], ['active', 'unknown'], ['canceled', APEX_PRICE],
      ['trialing', null], ['past_due', 'unknown'],
    ];
    for (const [status, price] of cases) {
      const out = entitlementFor(status, price, ENTITLING);
      if (out.problem) expect(out.tier).toBeNull();
      else expect(out.tier).not.toBeNull();
      expect(out.recognized).toBe(out.problem === null);
    }
  });
});

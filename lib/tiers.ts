/**
 * Tiers.
 *
 * Priced for the audience rather than for a spreadsheet: memecoin traders will
 * not sign up for a $30/mo SaaS, but they will pay less than the fee on a
 * single bad entry. DEGEN is deliberately cheap enough to be an impulse.
 */

export type Tier = 'FREE' | 'DEGEN' | 'APEX';

export interface TierSpec {
  id: Tier;
  name: string;
  priceUsd: number;
  tagline: string;
  /** Target Locks per UTC day. Infinity for unlimited. */
  dailyLocks: number;
  /** Tokens under live surveillance. */
  watchSlots: number;
  /** Open positions the exit engine will track and alert on. */
  positionSlots: number;
  insiderForensics: boolean;
  apiAccess: boolean;
  features: string[];
}

export const TIERS: Record<Tier, TierSpec> = {
  FREE: {
    id: 'FREE',
    name: 'Recon',
    priceUsd: 0,
    tagline: 'The full read, including the ladder. Three a day.',
    dailyLocks: 3,
    watchSlots: 1,
    positionSlots: 1,
    insiderForensics: false,
    apiAccess: false,
    features: [
      '3 Target Locks per day',
      'Full verdict, coil score and reasoning',
      'The exit ladder and structural stop',
      '1 position tracked',
      'Public track record access',
    ],
  },
  DEGEN: {
    id: 'DEGEN',
    name: 'Degen',
    priceUsd: 4.99,
    tagline: 'The engine watches your bags while you sleep.',
    dailyLocks: Number.POSITIVE_INFINITY,
    watchSlots: 15,
    positionSlots: 15,
    insiderForensics: false,
    apiAccess: false,
    features: [
      'Unlimited Target Locks',
      '15 positions tracked — the engine watches their ladders for you',
      '15 tokens under live surveillance',
      'Exit alerts: rung filled, stop hit, insiders distributing',
      'Coil-crossing alerts while you are asleep',
    ],
  },
  APEX: {
    id: 'APEX',
    name: 'Apex',
    priceUsd: 19.99,
    tagline: 'Full forensics on who is about to dump on you.',
    dailyLocks: Number.POSITIVE_INFINITY,
    watchSlots: 100,
    positionSlots: 100,
    insiderForensics: true,
    apiAccess: true,
    features: [
      'Everything in Degen',
      'Insider cluster forensics — every linked wallet, cost basis and exit',
      '100 positions and 100 tokens watched',
      'Priority sweep interval',
      'API access for your own bots',
    ],
  },
};

export const isPaid = (tier: Tier): boolean => tier !== 'FREE';

export function tierFromString(value: string | null | undefined): Tier {
  return value === 'DEGEN' || value === 'APEX' ? value : 'FREE';
}

const TIER_RANK: Record<Tier, number> = { FREE: 0, DEGEN: 1, APEX: 2 };

/** Whether `a` is at least as good as `b`. */
export const tierAtLeast = (a: Tier, b: Tier): boolean => TIER_RANK[a] >= TIER_RANK[b];

/**
 * The tier that actually governs access right now: whichever of the real
 * subscription tier and an active promo trial ranks higher.
 *
 * A trial can only ever add access, never take it away. Without that rule, a
 * paying Apex subscriber who redeemed a Degen trial code (or whose trial
 * simply expired) would get silently demoted to Degen or Free the moment the
 * trial fields stopped mattering — this makes the comparison explicit instead
 * of trusting whichever field happened to be read last.
 */
export function effectiveTier(
  tier: Tier,
  trialTier: string | null | undefined,
  trialEndsAt: Date | null | undefined,
  now: Date = new Date(),
): Tier {
  if (!trialTier || !trialEndsAt || trialEndsAt.getTime() <= now.getTime()) return tier;
  const trial = tierFromString(trialTier);
  return TIER_RANK[trial] > TIER_RANK[tier] ? trial : tier;
}

/** Stripe price ID -> tier. */
export function tierForPriceId(priceId: string | null | undefined): Tier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_DEGEN) return 'DEGEN';
  if (priceId === process.env.STRIPE_PRICE_APEX) return 'APEX';
  return null;
}

export function priceIdForTier(tier: Tier): string | null {
  if (tier === 'DEGEN') return process.env.STRIPE_PRICE_DEGEN || null;
  if (tier === 'APEX') return process.env.STRIPE_PRICE_APEX || null;
  return null;
}

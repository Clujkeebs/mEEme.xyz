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
  ladders: boolean;
  insiderForensics: boolean;
  apiAccess: boolean;
  features: string[];
}

export const TIERS: Record<Tier, TierSpec> = {
  FREE: {
    id: 'FREE',
    name: 'Recon',
    priceUsd: 0,
    tagline: 'Enough to prove it works on your own bags.',
    dailyLocks: 3,
    watchSlots: 1,
    positionSlots: 1,
    ladders: false,
    insiderForensics: false,
    apiAccess: false,
    features: [
      '3 Target Locks per day',
      'Verdict, coil score and full reasoning',
      '1 position tracked',
      'Public track record access',
    ],
  },
  DEGEN: {
    id: 'DEGEN',
    name: 'Degen',
    priceUsd: 4.99,
    tagline: 'The exit ladder, on every bag you hold.',
    dailyLocks: Number.POSITIVE_INFINITY,
    watchSlots: 15,
    positionSlots: 15,
    ladders: true,
    insiderForensics: false,
    apiAccess: false,
    features: [
      'Unlimited Target Locks',
      'Exit ladders with structural stops',
      '15 positions tracked, with exit alerts',
      '15 tokens under live surveillance',
      'Coil-crossing alerts',
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
    ladders: true,
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

import { prisma } from './db';
import { TIERS, tierAtLeast, tierFromString, type Tier } from './tiers';

/**
 * Promo code redemption.
 *
 * Grants access directly rather than through a Stripe coupon: the point of a
 * code like "3 days of Degen, free" is removing every point of friction
 * between a link and someone actually using the paid features, and asking for
 * a card number is exactly the friction that defeats it.
 *
 * One redemption per user, ever (enforced by the unique constraint on
 * PromoRedemption.userId) — a promo system that can be stacked or replayed
 * against a fresh code is not a trial, it is free service.
 */

export type RedeemFailure =
  | 'invalid'
  | 'expired'
  | 'exhausted'
  | 'already_redeemed'
  | 'already_entitled';

export interface RedeemResult {
  ok: boolean;
  failure?: RedeemFailure;
  error?: string;
  trialTier?: Tier;
  trialEndsAt?: Date;
}

export async function redeemPromoCode(
  userId: string,
  rawCode: string,
  now: Date = new Date(),
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, failure: 'invalid', error: 'Enter a code.' };

  const promo = await prisma.promoCode.findUnique({
    where: { code },
    select: { id: true, trialTier: true, trialDays: true, maxRedemptions: true, active: true, expiresAt: true },
  });
  if (!promo || !promo.active) {
    return { ok: false, failure: 'invalid', error: 'That code is not valid.' };
  }
  if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, failure: 'expired', error: 'That code has expired.' };
  }

  // A user gets one trial, ever — checked before capacity, so "you already
  // used a code" (which is about them) is what a repeat visitor sees rather
  // than "sold out" (which is about the code and invites retrying).
  const alreadyRedeemed = await prisma.promoRedemption.findUnique({ where: { userId } });
  if (alreadyRedeemed) {
    return { ok: false, failure: 'already_redeemed', error: 'You have already used a promo code.' };
  }

  if (promo.maxRedemptions !== null) {
    const count = await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } });
    if (count >= promo.maxRedemptions) {
      return { ok: false, failure: 'exhausted', error: 'That code has already been fully claimed.' };
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
  if (!user) return { ok: false, failure: 'invalid', error: 'Sign in first.' };

  const trialTier = tierFromString(promo.trialTier);
  const currentTier = tierFromString(user.tier);
  if (tierAtLeast(currentTier, trialTier)) {
    return {
      ok: false,
      failure: 'already_entitled',
      error: `You already have ${TIERS[currentTier].name} — no upgrade needed.`,
    };
  }

  const trialEndsAt = new Date(now.getTime() + promo.trialDays * 24 * 60 * 60_000);

  try {
    await prisma.$transaction([
      // The unique constraint on userId is the actual race guard: two
      // concurrent redemptions from the same user can both pass the check
      // above, but only one create() here survives.
      prisma.promoRedemption.create({ data: { promoCodeId: promo.id, userId } }),
      prisma.user.update({ where: { id: userId }, data: { trialTier, trialEndsAt } }),
    ]);
  } catch {
    return { ok: false, failure: 'already_redeemed', error: 'You have already used a promo code.' };
  }

  return { ok: true, trialTier, trialEndsAt };
}

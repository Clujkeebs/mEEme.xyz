/**
 * localStorage key a promo code is held in between being seen (a `?promo=`
 * link, or typed at signup) and being redeemed (which needs a signed-in
 * user). Shared so PromoBanner and the signup form agree on where to look —
 * whichever of them captures a code first, the other picks it up.
 */
export const PROMO_STORAGE_KEY = 'meeme.pending-promo';

import Stripe from 'stripe';

/**
 * Stripe is optional. With no secret key the app runs with everyone on the free
 * tier and the upgrade buttons explain why they are disabled, rather than
 * throwing at import time and taking the whole deployment down.
 */

const KEY = process.env.STRIPE_SECRET_KEY ?? '';

export const stripeConfigured = (): boolean =>
  KEY.trim().length > 0 &&
  Boolean(process.env.STRIPE_PRICE_DEGEN || process.env.STRIPE_PRICE_APEX);

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!KEY.trim()) return null;
  if (!client) {
    client = new Stripe(KEY, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
      // Retries here are safe: Stripe deduplicates by idempotency key.
      maxNetworkRetries: 2,
      timeout: 12_000,
    });
  }
  return client;
}

/** The public origin, used for Stripe redirect URLs. */
export function appUrl(): string {
  const raw =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

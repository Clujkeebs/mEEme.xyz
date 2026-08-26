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

/**
 * The public origin.
 *
 * Deliberately paranoid: this feeds `metadataBase`, which Next evaluates while
 * prerendering, so a malformed value does not degrade a page — it fails the
 * whole build. An environment variable that exists but is blank or mistyped is
 * an ordinary deployment mistake and must not be able to do that.
 */
export function appOrigin(): URL {
  const candidates = [
    process.env.NEXTAUTH_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'http://localhost:3000',
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    try {
      return new URL(trimmed);
    } catch {
      // Set but unusable — try the next source rather than take the build down.
      console.warn(`[config] ignoring unparseable origin: ${trimmed}`);
    }
  }

  return new URL('http://localhost:3000');
}

/** The public origin as a string, with no trailing slash. */
export function appUrl(): string {
  return appOrigin().toString().replace(/\/+$/, '');
}

/**
 * Detects Stripe's "no portal configuration" failure.
 *
 * In live mode Stripe does not provision a default customer-portal
 * configuration the way it does in a sandbox — someone has to activate it in
 * the dashboard once. Until that happens every portal session throws, and a
 * subscriber is left with no way out of a subscription they are paying for.
 *
 * Matched on the message rather than a code because Stripe returns this as a
 * generic `invalid_request_error` with no distinguishing code. Kept here, next
 * to the client it guards, so it is importable by a test — a copy of it living
 * inside the route handler could drift from the route without failing anything.
 */
export function isPortalNotConfigured(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  const message = err instanceof Error ? err.message : String(err);
  return /no configuration|default configuration|portal settings/i.test(message);
}

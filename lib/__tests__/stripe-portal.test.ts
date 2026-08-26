import { describe, expect, it } from 'vitest';
import { isPortalNotConfigured } from '@/lib/stripe';

/**
 * Guards the fallback that keeps a paying subscriber able to cancel.
 *
 * If this detector stops matching, the portal route returns a generic 502
 * instead of the flag the UI needs to offer the cancellation route — and the
 * subscriber hits a dead end while still being billed. That failure is
 * invisible in production until someone tries to leave, which is exactly when
 * it does the most damage, so it is pinned here against the real message.
 */
describe('isPortalNotConfigured', () => {
  it('matches the live-mode error Stripe actually returns', () => {
    const real = new Error(
      'Invalid request: You have not created a default configuration for your billing portal. ' +
        'Create one in test mode at https://dashboard.stripe.com/test/settings/billing/portal, ' +
        'or in live mode at https://dashboard.stripe.com/settings/billing/portal.',
    );
    expect(isPortalNotConfigured(real)).toBe(true);
  });

  it('matches the shorter no-configuration phrasing', () => {
    expect(
      isPortalNotConfigured(
        new Error('No configuration provided and your default configuration has not been created.'),
      ),
    ).toBe(true);
  });

  it('does not swallow unrelated Stripe failures', () => {
    // These must fall through to the generic error path — reporting a rate
    // limit or a bad key as "portal unavailable" would send the user to email
    // support for a problem that a retry would have fixed.
    expect(isPortalNotConfigured(new Error('No such customer: cus_123'))).toBe(false);
    expect(isPortalNotConfigured(new Error('Request rate limit exceeded'))).toBe(false);
    expect(isPortalNotConfigured(new Error('Invalid API Key provided'))).toBe(false);
  });

  it('handles non-Error throws without crashing', () => {
    expect(isPortalNotConfigured('default configuration missing')).toBe(true);
    expect(isPortalNotConfigured(null)).toBe(false);
    expect(isPortalNotConfigured(undefined)).toBe(false);
    expect(isPortalNotConfigured({ weird: true })).toBe(false);
  });
});

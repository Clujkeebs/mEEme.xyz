'use client';

import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { OPTIONAL_CATEGORIES, readConsent, writeConsent, type ConsentCategory } from '@/lib/consent';

/**
 * Cookie notice.
 *
 * Rendered only after mount, because the decision lives in a cookie that the
 * server does not read — showing it during SSR would either flash for people
 * who already dismissed it or cause a hydration mismatch.
 *
 * It is not a modal: the site sets no optional cookies, so there is nothing to
 * block on, and trapping focus behind a notice nobody legally has to answer is
 * a worse accessibility outcome than letting it sit at the bottom of the page.
 */
export function CookieConsent() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (readConsent() === null) setVisible(true);
  }, []);

  const decide = React.useCallback((granted: ConsentCategory[]) => {
    writeConsent(granted);
    setVisible(false);
  }, []);

  if (!visible) return null;

  const hasChoice = OPTIONAL_CATEGORIES.length > 0;

  return (
    <section
      // A region rather than a dialog: announced to screen readers and
      // reachable by landmark navigation, without seizing focus.
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 md:flex-row md:items-center md:justify-between lg:px-8">
        {/* Full text on tablet/desktop, where a few extra lines cost nothing.
            On a phone the same copy ran to 5-6 lines and, being `fixed`,
            permanently ate a third of the viewport — so it's a one-line
            summary there instead. The full policy is one tap away either way. */}
        <p className="hidden max-w-3xl text-[13px] leading-relaxed text-muted-foreground sm:block">
          {hasChoice ? (
            <>
              We use essential cookies to keep you signed in, and would like to use optional cookies
              to understand how the site is used. Optional cookies stay off unless you accept.
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground/90">
                This site uses only essential cookies.
              </span>{' '}
              They keep you signed in and remember this choice. There is no analytics, no
              advertising, and no cross-site tracking here — so there is nothing to opt out of.
            </>
          )}{' '}
          <Link href="/cookies" className="text-primary underline underline-offset-4">
            Read the cookie policy
          </Link>
          .
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground sm:hidden">
          <span className="font-semibold text-foreground/90">Essential cookies only.</span>{' '}
          <Link href="/cookies" className="text-primary underline underline-offset-4">
            Read the policy
          </Link>
          .
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {hasChoice && (
            <Button variant="outline" size="sm" onClick={() => decide([])}>
              Essential only
            </Button>
          )}
          <Button size="sm" onClick={() => decide(hasChoice ? [...OPTIONAL_CATEGORIES] : [])}>
            {hasChoice ? 'Accept all' : 'Got it'}
          </Button>
        </div>
      </div>
    </section>
  );
}

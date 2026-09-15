'use client';

import { Check, Copy, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { BRAND_TOKEN_MINT, BRAND_TOKEN_SYMBOL } from '@/lib/brand-token';

/**
 * The site-wide top bar for our own token.
 *
 * Mounted above SiteHeader in the root layout — literally the first thing on
 * every page, above the logo and nav — at the user's explicit request for
 * more prominence than the footer link + /token page carried on their own.
 *
 * The disclosure still has to travel with it. Terms §13 says "any page on
 * this site that mentions $MEEME says plainly that we hold it and are
 * promoting it" — a bar that just showed a contract address with no framing
 * would read as the engine endorsing a token, which is the one confusion
 * this whole feature exists to prevent. So the disclosure word ("ours") is
 * in the bar itself, not just one click away on /token.
 *
 * Not sticky: it occupies real space on first paint and then scrolls away
 * with the rest of the page, rather than permanently eating a strip of every
 * screen forever. Dismissible for the rest of the session, same pattern as
 * PromoBanner — plain component state, no persistence, so it is back at
 * full visibility on the next fresh visit.
 *
 * Suppressed for paid-ad landings specifically (see AD_CLICK_PARAMS below).
 * X's ad review reads the landing page, not just the creative, and an app
 * ad that lands on a page showing a live token contract address and a "copy
 * CA" button reads as crypto-token promotion to that review regardless of
 * what the ad itself says — real risk of the ad getting flagged or the
 * account restricted. Wrapped in Suspense for the same reason
 * AffiliateCapture is: a bare useSearchParams() would force every statically
 * prerendered page back to fully dynamic rendering.
 */
export function TokenBar() {
  return (
    <React.Suspense fallback={null}>
      <TokenBarInner />
    </React.Suspense>
  );
}

const STORAGE_KEY = 'meeme.paid-landing';

/** Click-id params set by the major ad platforms, plus a generic paid utm_medium. */
const AD_CLICK_PARAMS = ['twclid', 'gclid', 'fbclid', 'msclkid'];

function isPaidLanding(searchParams: URLSearchParams): boolean {
  if (AD_CLICK_PARAMS.some((p) => searchParams.has(p))) return true;
  const medium = searchParams.get('utm_medium');
  return medium ? /^(cpc|ppc|paid|ads?)$/i.test(medium) : false;
}

function TokenBarInner() {
  const searchParams = useSearchParams();
  // Computed straight from the URL during render, not an effect — this is
  // the one that actually matters for ad review, and it has to be true on
  // the very first paint of the landing page with zero flash-in.
  const urlSaysPaid = isPaidLanding(searchParams);
  const [dismissed, setDismissed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // Carries the suppression to later pages in the same tab once the ad-click
  // param has been left behind by navigation. Session-only by design — a
  // fresh visit with no ad param is a fresh judgment call.
  const [sessionSaysPaid, setSessionSaysPaid] = React.useState(false);

  React.useEffect(() => {
    if (urlSaysPaid) {
      try {
        sessionStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // Private browsing or a full quota — this page load is still
        // suppressed via urlSaysPaid, it just will not carry to the next one.
      }
      return;
    }
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') setSessionSaysPaid(true);
    } catch {
      // No stored flag reachable — default to showing the bar, same as a
      // visitor who was never flagged.
    }
  }, [urlSaysPaid]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BRAND_TOKEN_MINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — the address is still selectable in the bar.
    }
  };

  if (dismissed || urlSaysPaid || sessionSaysPaid) return null;

  return (
    <div role="region" aria-label="Our own token" className="border-b border-primary/30 bg-primary/[0.07]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2 sm:px-6 lg:px-8">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-snug text-foreground/90">
          <span className="font-semibold text-primary">Our own token, {BRAND_TOKEN_SYMBOL}.</span>
          <span className="text-muted-foreground">We hold it and are promoting it —</span>
          <Link href="/token" className="underline underline-offset-2 hover:text-primary">
            disclosure
          </Link>
          <span className="text-muted-foreground">·</span>
          <code className="break-all font-mono text-[11px] text-foreground/80">{BRAND_TOKEN_MINT}</code>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Copy contract address"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

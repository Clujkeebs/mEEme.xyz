'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PROMO_STORAGE_KEY } from '@/lib/promo-storage';

/**
 * Mounted in the root layout, which wraps every route — including the
 * statically prerendered ones (homepage, blog posts, legal pages). Next.js
 * requires any `useSearchParams()` consumer to sit inside a Suspense boundary
 * or it forces the whole page back to fully dynamic rendering, silently
 * undoing the ISR work those pages depend on. `fallback={null}` is correct
 * here: a promo banner is progressive enhancement, not content a visitor is
 * waiting on.
 */
export function PromoBanner() {
  return (
    <React.Suspense fallback={null}>
      <PromoBannerInner />
    </React.Suspense>
  );
}


/**
 * Captures a promo code from the URL and carries it through sign-in.
 *
 * The naive version — read `?promo=`, redeem it — breaks the moment a visitor
 * has to authenticate first, which is every first-time visitor: a query param
 * on the landing URL does not reliably survive the round trip through Google
 * OAuth, and doesn't exist at all if they land on /signin and create an
 * account instead. localStorage does survive both: written the instant the
 * code is seen, read back on every page after sign-in completes (or prefilled
 * straight into the signup form's own code field — see SignInPanel).
 *
 * Mounted once in the root layout so it fires no matter which page a promo
 * link points at.
 */
function PromoBannerInner() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const attemptedRef = React.useRef(false);

  // Pick up ?promo=/?code= from the URL, persist it, then strip it from the
  // URL — a code sitting in the address bar after it has already been
  // captured is just clutter (and would re-trigger this effect on every nav).
  React.useEffect(() => {
    const fromUrl = searchParams.get('promo') ?? searchParams.get('code');
    if (fromUrl) {
      const code = fromUrl.trim().toUpperCase();
      try {
        localStorage.setItem(PROMO_STORAGE_KEY, code);
      } catch {
        // Private browsing or a full quota — the code still works for this
        // page load via component state, it just will not survive a sign-in
        // redirect. Nothing to do about that from here.
      }
      setPendingCode(code);
      const next = new URLSearchParams(searchParams);
      next.delete('promo');
      next.delete('code');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      return;
    }
    try {
      const stored = localStorage.getItem(PROMO_STORAGE_KEY);
      if (stored) setPendingCode(stored);
    } catch {
      // No stored code reachable — nothing pending, which is the safe default.
    }
    // Only ever re-run this branch when the URL itself changes; reading
    // localStorage on every render would fight the redeem effect's cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Once signed in, redeem automatically — exactly once per mount, so a
  // failed attempt (e.g. a network blip) does not loop.
  React.useEffect(() => {
    if (status !== 'authenticated' || !pendingCode || attemptedRef.current) return;
    attemptedRef.current = true;

    void fetch('/api/promo/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pendingCode }),
    })
      .then((res) => res.json())
      .then((json: { ok: boolean; error?: string; trialTier?: string; trialEndsAt?: string }) => {
        try {
          localStorage.removeItem(PROMO_STORAGE_KEY);
        } catch {
          // Best-effort cleanup only.
        }
        setPendingCode(null);
        if (json.ok) {
          toast.success(`${pendingCode} applied. ${json.trialTier} unlocked, on us.`);
          router.refresh();
        } else if (json.error && !/already used|no upgrade needed/i.test(json.error)) {
          // A code that is simply stale (expired, already redeemed) is not
          // worth nagging a returning visitor about — only surface genuine
          // problems, like a typo'd or unknown code.
          toast.error(json.error);
        }
      })
      .catch(() => {
        // A network failure here should not block navigation or retry-loop;
        // the code stays in localStorage and the next page load tries again.
      });
  }, [status, pendingCode, router]);

  if (status !== 'unauthenticated' || !pendingCode || dismissed) return null;

  return (
    <div role="region" aria-label="Promo code" className="border-b border-primary/30 bg-primary/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <p className="text-[13px] text-foreground/90">
          Code <span className="font-mono font-semibold text-primary">{pendingCode}</span> is ready to
          activate.
        </p>
        <div className="flex items-center gap-3">
          <Button size="sm" asChild>
            <Link href="/signin">Sign in to activate</Link>
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

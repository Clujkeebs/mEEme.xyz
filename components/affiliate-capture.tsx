'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import * as React from 'react';

/**
 * Captures `?ref=CODE` and attributes the signed-in user to that affiliate
 * once they're authenticated — silently. Unlike PromoBanner this grants the
 * visitor nothing, so there is nothing worth interrupting them with; it just
 * needs to remember the code across the sign-in round trip the same way
 * PromoBanner does (localStorage, not the URL, because the URL does not
 * reliably survive an OAuth redirect or a "create account" page load).
 *
 * Mounted once in the root layout, wrapped in Suspense for the same reason
 * PromoBanner is: a bare useSearchParams() would force every statically
 * prerendered page back to fully dynamic rendering.
 */
export function AffiliateCapture() {
  return (
    <React.Suspense fallback={null}>
      <AffiliateCaptureInner />
    </React.Suspense>
  );
}

const STORAGE_KEY = 'meeme.pending-ref';

function AffiliateCaptureInner() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);
  const attemptedRef = React.useRef(false);

  React.useEffect(() => {
    const fromUrl = searchParams.get('ref');
    if (fromUrl) {
      const code = fromUrl.trim().toUpperCase();
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {
        // Private browsing or a full quota — the code still works for this
        // page load via component state, it just will not survive a sign-in
        // redirect.
      }
      setPendingCode(code);
      const next = new URLSearchParams(searchParams);
      next.delete('ref');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPendingCode(stored);
    } catch {
      // No stored code reachable — nothing pending, the safe default.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  React.useEffect(() => {
    if (status !== 'authenticated' || !pendingCode || attemptedRef.current) return;
    attemptedRef.current = true;

    void fetch('/api/affiliate/attribute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pendingCode }),
    }).finally(() => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Best-effort cleanup only.
      }
      setPendingCode(null);
    });
  }, [status, pendingCode]);

  return null;
}

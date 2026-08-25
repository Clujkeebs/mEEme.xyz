'use client';

import { RotateCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary.
 *
 * Without this, an unhandled render error shows Next's unstyled default page,
 * which on a paid product reads as "this site is broken" rather than "one
 * thing failed". It also gives the user a retry that re-runs the failed
 * segment without a full reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Server-side digests are all a user can quote back to us; log the rest
    // where an operator can actually see it.
    console.error('[render]', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-destructive/80">
        engine fault
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Something broke.</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        This page failed to render. It is not something you did. Upstream market data is the usual
        cause, and it is often gone on a retry.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground/70">
          reference: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to safety</Link>
        </Button>
      </div>
    </div>
  );
}

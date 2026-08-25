import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Page not found',
  // A 404 that gets indexed competes with the pages that should rank.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary/70">
        error 404 · no lock
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">
        Nothing at this address.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        The page you asked for does not exist. If you followed a share link to a call, it may have
        been for a token that was never published — only real, non-demo calls make it into the public
        ledger.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/lock">Run a Target Lock</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/track-record">See the track record</Link>
        </Button>
      </div>
    </div>
  );
}

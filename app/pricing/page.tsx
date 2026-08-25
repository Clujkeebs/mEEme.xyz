import type { Metadata } from 'next';
import { PricingTable } from '@/components/pricing-table';
import { getViewer } from '@/lib/auth';
import { stripeConfigured } from '@/lib/stripe';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free reads forever. The exit ladder is the paid half.',
};

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const viewer = await getViewer();
  return (
    <div className="py-10">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          The read is free. The vigil is not.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Every tier gets the whole thing — verdict, reasoning, exit ladder, structural stop. Three a
          day, no account needed. What you pay for is the engine re-reading your positions every few
          minutes and waking you when a rung fills, a stop breaks, or the insiders start selling.
        </p>
      </header>

      <PricingTable currentTier={viewer?.tier ?? null} signedIn={Boolean(viewer)} paymentsLive={stripeConfigured()} />
    </div>
  );
}

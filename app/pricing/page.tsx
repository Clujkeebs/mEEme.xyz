import type { Metadata } from 'next';
import { PricingTable } from '@/components/pricing-table';
import { PromoRedeemForm } from '@/components/promo-redeem-form';
import { stripeConfigured } from '@/lib/stripe';
import { breadcrumbSchema, canonicalMetadata, jsonLdGraph, softwareApplicationSchema } from '@/lib/seo';
import { TIERS } from '@/lib/tiers';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free reads forever. The exit ladder is the paid half.',
  ...canonicalMetadata('/pricing'),
};

// Static. Everything here is built from TIERS and identical for every
// visitor; the only personalised bits (which plan you are on, whether the
// promo form applies) now resolve on the client. Pricing was the slowest route
// in the app at 117 req/s purely because a session lookup made it dynamic, and
// it is one of the first pages a launch crowd opens.
export const revalidate = 3600;

export default function PricingPage() {
  return (
    <div className="py-10">
      {/* Offers are built from TIERS, so the price a crawler is shown can never
          drift from the price checkout charges. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdGraph(
            softwareApplicationSchema(
              Object.values(TIERS).map((t) => ({ name: t.name, price: t.priceUsd })),
            ),
            breadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Pricing', path: '/pricing' },
            ]),
          ),
        }}
      />
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          The read is free. The vigil is not.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Every tier gets the whole thing: verdict, reasoning, exit ladder, structural stop. Three a
          day, no account needed. What you pay for is the engine re-reading your positions every few
          minutes and waking you when a rung fills, a stop breaks, or the insiders start selling.
        </p>
      </header>

      <PricingTable paymentsLive={stripeConfigured()} />

      <div className="mt-8 flex justify-center">
        <PromoRedeemForm signedInOnly />
      </div>
    </div>
  );
}

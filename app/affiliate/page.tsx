import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MailQuestion } from 'lucide-react';
import { AffiliateDashboardView } from '@/components/affiliate-dashboard-view';
import { Button } from '@/components/ui/button';
import { getAffiliateDashboard, getAffiliateForViewer } from '@/lib/affiliate';
import { getViewer } from '@/lib/auth';
import { databaseConfigured } from '@/lib/db';
import { CONTACT_EMAIL } from '@/components/legal';

export const metadata: Metadata = { title: 'Affiliate dashboard', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AffiliatePage() {
  const viewer = await getViewer();
  if (!viewer) redirect(databaseConfigured() ? '/signin?next=%2Faffiliate' : '/lock');

  const affiliate = await getAffiliateForViewer(viewer);

  // Previously a silent redirect to the homepage. That is the worst possible
  // answer here: a partner who has been told they have a dashboard, signs up,
  // opens /affiliate and gets bounced to the marketing page with no
  // explanation, concludes the product is broken — which is exactly what
  // happened. An affiliate is keyed by the email their partnership was
  // registered under, so the overwhelmingly likely cause is that they signed
  // up with a different address, and the only way they can work that out is
  // if we show them which address they are actually signed in as.
  if (!affiliate) {
    return (
      <div className="mx-auto max-w-lg py-20">
        <div className="hud-panel corner-bracket p-8 text-center">
          <MailQuestion className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
            No affiliate account on this login
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You are signed in as{' '}
            <span className="font-mono text-foreground">{viewer.email ?? 'an unknown address'}</span>, and
            there is no affiliate partnership registered to it.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Affiliate dashboards are tied to the exact email the partnership was set up with. If you
            signed up here with a different address, sign out and use that one — or send us the address
            you want it moved to.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Affiliate%20dashboard%20access`}>
                Email us about access
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to Watchtower</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const dashboard = await getAffiliateDashboard(affiliate.id);

  return <AffiliateDashboardView dashboard={dashboard} />;
}

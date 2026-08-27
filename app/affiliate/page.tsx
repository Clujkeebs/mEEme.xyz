import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AffiliateDashboardView } from '@/components/affiliate-dashboard-view';
import { getAffiliateDashboard, getAffiliateForViewer } from '@/lib/affiliate';
import { getViewer } from '@/lib/auth';
import { databaseConfigured } from '@/lib/db';

export const metadata: Metadata = { title: 'Affiliate dashboard', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AffiliatePage() {
  const viewer = await getViewer();
  if (!viewer) redirect(databaseConfigured() ? '/signin' : '/lock');

  const affiliate = await getAffiliateForViewer(viewer);
  if (!affiliate) redirect('/');

  const dashboard = await getAffiliateDashboard(affiliate.id);

  return <AffiliateDashboardView dashboard={dashboard} />;
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminAffiliatesPanel } from '@/components/admin-affiliates-panel';
import { AdminNav } from '@/components/admin-nav';
import { isAdmin } from '@/lib/admin';
import { listAffiliatesForAdmin } from '@/lib/affiliate';
import { getViewer } from '@/lib/auth';

export const metadata: Metadata = { title: 'Affiliates', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminAffiliatesPage() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) redirect('/');

  const summary = await listAffiliatesForAdmin();

  return (
    <div className="py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary/70">admin</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Affiliates</h1>
      <AdminNav active="affiliates" />
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Each code is shareable as <code className="rounded bg-black/30 px-1">meeme.xyz/?ref=CODE</code>. A
        referred signup earns nothing by itself — commission accrues only once that person pays, for 12
        months from their first paid invoice. The affiliate sees their own numbers at{' '}
        <code className="rounded bg-black/30 px-1">/affiliate</code> once signed in with the email
        registered here.
      </p>

      <AdminAffiliatesPanel initialSummary={summary} />
    </div>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin-nav';
import { AdminTrackRecordPanel } from '@/components/admin-track-record-panel';
import { isAdmin } from '@/lib/admin';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const metadata: Metadata = { title: 'Track record', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminTrackRecordPage() {
  const viewer = await getViewer();
  // Redirect to the homepage rather than a "you are not allowed here" page —
  // the latter confirms to a non-admin that the route exists at all.
  if (!isAdmin(viewer)) redirect('/');

  const [total, graded, correct] = await Promise.all([
    prisma.signal.count({ where: { synthetic: false } }),
    prisma.signalOutcome.count({ where: { grade: { not: 'pending' } } }),
    prisma.signalOutcome.count({ where: { grade: 'correct' } }),
  ]);

  return (
    <div className="py-8">
      <p className="eyebrow text-primary/70">admin</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Track record</h1>
      <AdminNav active="track-record" />
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        The only action here is destructive. There is nothing to configure, tune, or partially
        remove — see the request that led to this page existing if you need the reasoning again.
      </p>

      <div className="mt-6">
        <AdminTrackRecordPanel initialCounts={{ total, graded, correct }} />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin-nav';
import { AdminUsersPanel } from '@/components/admin-users-panel';
import { isAdmin, listUsersForAdmin } from '@/lib/admin';
import { getViewer } from '@/lib/auth';

export const metadata: Metadata = { title: 'Users', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) redirect('/');

  const users = await listUsersForAdmin();

  return (
    <div className="py-8">
      <p className="eyebrow text-primary/70">admin</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Users</h1>
      <AdminNav active="users" />
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Every account, most recent first. &ldquo;Referred&rdquo; counts signups that used this
        person&apos;s referral code — the only affiliate mechanism this app has today.
      </p>

      <AdminUsersPanel initialUsers={users} />
    </div>
  );
}

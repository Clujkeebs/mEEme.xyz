import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminPromoPanel } from '@/components/admin-promo-panel';
import { isAdmin } from '@/lib/admin';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const metadata: Metadata = { title: 'Promo codes', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminPromoPage() {
  const viewer = await getViewer();
  // Redirect to the homepage rather than a "you are not allowed here" page —
  // the latter confirms to a non-admin that the route exists at all.
  if (!isAdmin(viewer)) redirect('/');

  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { redemptions: true } } },
  });

  return (
    <div className="py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary/70">admin</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Promo codes</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        A code grants a time-boxed trial of a paid tier directly — no card, no Stripe checkout. Each
        signed-in user can redeem exactly one code, ever.
      </p>

      <AdminPromoPanel
        initialCodes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          trialTier: c.trialTier,
          trialDays: c.trialDays,
          maxRedemptions: c.maxRedemptions,
          active: c.active,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          note: c.note,
          createdByEmail: c.createdByEmail,
          createdAt: c.createdAt.toISOString(),
          redemptionCount: c._count.redemptions,
        }))}
      />
    </div>
  );
}

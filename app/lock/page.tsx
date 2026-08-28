import type { Metadata } from 'next';
import { TargetLock } from '@/components/cockpit/target-lock';
import { RecentReads, type RecentRead } from '@/components/recent-reads';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canonicalMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Target Lock',
  description: 'Paste a contract. Find out who still has to sell, and what that means for your exit.',
  ...canonicalMetadata('/lock'),
};

export const dynamic = 'force-dynamic';

/**
 * The most recent public reads, for the strip under the form. Never demo
 * runs — a wall of synthetic calls dressed up as activity is exactly the
 * dishonesty the track record exists to avoid. Failure is silent: the strip
 * is context, and must never be the reason someone cannot lock a contract.
 */
async function recentReads(): Promise<RecentRead[]> {
  try {
    const rows = await prisma.signal.findMany({
      where: { synthetic: false },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { shareSlug: true, symbol: true, verdict: true, coilScore: true, createdAt: true },
    });
    return rows.map((r) => ({
      slug: r.shareSlug,
      symbol: r.symbol,
      verdict: r.verdict,
      coilScore: r.coilScore,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

export default async function LockPage({
  searchParams,
}: {
  searchParams: { address?: string };
}) {
  const [viewer, reads] = await Promise.all([getViewer(), recentReads()]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Target Lock</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Paste a contract address. mEEme reconstructs what every holder paid, works out which of them
          can profitably sell into your exit, and gives you a verdict, a ladder and a stop.
        </p>
      </header>
      <TargetLock initialAddress={searchParams.address ?? ''} signedIn={Boolean(viewer)} />

      {/* Only when the page is at rest — once a read is on screen, this is
          noise competing with the thing the visitor came for. */}
      {!searchParams.address && (
        <div className="pt-6">
          <RecentReads reads={reads} />
        </div>
      )}
    </div>
  );
}

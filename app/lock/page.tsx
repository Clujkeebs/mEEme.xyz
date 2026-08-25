import type { Metadata } from 'next';
import { TargetLock } from '@/components/cockpit/target-lock';
import { getViewer } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Target Lock',
  description: 'Paste a contract. Find out who still has to sell, and what that means for your exit.',
};

export const dynamic = 'force-dynamic';

export default async function LockPage({
  searchParams,
}: {
  searchParams: { address?: string };
}) {
  const viewer = await getViewer();
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
    </div>
  );
}

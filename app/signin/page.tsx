import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInPanel } from '@/components/signin-panel';
import { getViewer, googleConfigured } from '@/lib/auth';
import { safeNextPath } from '@/lib/next-path';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // Anyone bounced here from a gated page carries where they were trying to
  // go. Without it, signing in always dumped you on /dashboard and left you
  // to navigate back — which is how an affiliate who followed a link to
  // /affiliate ends up on a page that says nothing about affiliates.
  const next = safeNextPath(searchParams.next);
  const viewer = await getViewer();
  if (viewer) redirect(next);
  return <SignInPanel googleEnabled={googleConfigured()} next={next} />;
}

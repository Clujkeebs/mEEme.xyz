import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInPanel } from '@/components/signin-panel';
import { getViewer, googleConfigured } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const viewer = await getViewer();
  if (viewer) redirect('/dashboard');
  return <SignInPanel googleEnabled={googleConfigured()} />;
}

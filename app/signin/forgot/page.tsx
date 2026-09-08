import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/forgot-password-form';
import { emailConfigured } from '@/lib/notify/email';
import { canonical } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a link to set a new password on your mEEme account.',
  alternates: { canonical: canonical('/signin/forgot') },
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Enter the email on your account and we will send a link to set a new password. The link
        works once and expires in an hour.
      </p>

      <div className="mt-6">
        <ForgotPasswordForm available={emailConfigured()} />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/signin" className="text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

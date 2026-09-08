import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/reset-password-form';
import { canonical } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Set a new password',
  description: 'Set a new password on your mEEme account.',
  alternates: { canonical: canonical('/signin/reset') },
  robots: { index: false, follow: false },
};

/*
 * The token is deliberately NOT read here.
 *
 * The first version of this page took it from searchParams and passed it to the
 * form as a prop, with a comment claiming it was never rendered into the page.
 * That was simply false, and a QA check caught it: a prop crossing into a client
 * component is serialized into the RSC payload, so the token was sitting in the
 * page source in plain text.
 *
 * It is read from the address bar on the client instead, and scrubbed from the
 * bar immediately after — see ResetPasswordForm. The URL is the one place the
 * token has to travel, because that is the only thing an email link can carry;
 * everywhere after that is a place it does not need to be.
 *
 * The page is also noindex, so it cannot end up in a search result.
 */
export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
      <ResetPasswordForm />
      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/signin" className="text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

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
 * The token arrives in the query string, which is how a link in an email can
 * carry it at all. It is read here and posted from the client — it is never
 * rendered into the page, so it does not end up in a screenshot, and the page
 * is noindex so it cannot end up in a search result either.
 */
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === 'string' ? searchParams.token : '';

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>

      {token ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose something at least 8 characters. Setting it signs out every other session on this
            account.
          </p>
          <div className="mt-6">
            <ResetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This page needs the link from your reset email.{' '}
          <Link href="/signin/forgot" className="text-primary underline-offset-4 hover:underline">
            Request a new one
          </Link>
          .
        </p>
      )}
    </div>
  );
}

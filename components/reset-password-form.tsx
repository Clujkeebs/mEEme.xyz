'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { passwordProblem } from '@/lib/password-rules';

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  /*
   * The token is read from the address bar rather than handed down as a prop.
   *
   * A prop crossing into a client component is serialized into the RSC payload,
   * which put the token in the page source in plain text — the first version of
   * this did exactly that while carrying a comment claiming it did not.
   *
   * Reading it here and then replacing the history entry gets it out of the
   * address bar too, which is worth more than it sounds: it keeps the token off
   * screenshots and out of a shoulder-surfer's view, and stops it travelling in
   * a Referer header. replaceState rather than pushState, so Back does not
   * return to a URL that no longer works.
   *
   * `null` means not read yet and `''` means read and absent, which is the
   * difference between "still deciding what to show" and "this link is not a
   * reset link" — collapsing them flashes the error state on every load.
   */
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    const found = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(found);
    if (found) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Checked here for a fast answer and again on the server, which is the one
  // that counts — this only saves a round trip.
  const problem = password.length > 0 ? passwordProblem(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length > 0 && !problem && !mismatch && confirm.length > 0;

  // Nothing to render until the address bar has been read.
  if (token === null) return <div className="mt-6 h-40" aria-hidden="true" />;

  if (token === '') {
    return (
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        This page needs the link from your reset email.{' '}
        <Link href="/signin/forgot" className="text-primary underline-offset-4 hover:underline">
          Request a new one
        </Link>
        .
      </p>
    );
  }

  return (
    <>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
      Choose something at least 8 characters. Setting it signs out every other session on this
      account.
    </p>
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        void fetch('/api/auth/reset-confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, password }),
        })
          .then(async (res) => {
            const json = (await res.json()) as { ok: boolean; error?: string };
            if (json.ok) {
              toast.success('Password changed. Sign in with the new one.');
              router.push('/signin');
            } else {
              toast.error(json.error ?? 'Could not set the password.');
            }
          })
          .catch(() => toast.error('Could not reach the server. Try again.'))
          .finally(() => setBusy(false));
      }}
    >
      <div>
        <label className="hud-label mb-1 block" htmlFor="new-password">
          new password
        </label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          aria-describedby={problem ? 'new-password-problem' : undefined}
          aria-invalid={problem ? true : undefined}
        />
        {problem && (
          <p id="new-password-problem" className="mt-1 text-[12px] text-destructive">
            {problem}
          </p>
        )}
      </div>

      <div>
        <label className="hud-label mb-1 block" htmlFor="confirm-password">
          confirm password
        </label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          aria-describedby={mismatch ? 'confirm-password-problem' : undefined}
          aria-invalid={mismatch ? true : undefined}
        />
        {mismatch && (
          <p id="confirm-password-problem" className="mt-1 text-[12px] text-destructive">
            These do not match.
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={busy || !ready}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Set password
      </Button>
    </form>
    </>
  );
}

'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { passwordProblem } from '@/lib/password-rules';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // Checked here for a fast answer and again on the server, which is the one
  // that counts — this only saves a round trip.
  const problem = password.length > 0 ? passwordProblem(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length > 0 && !problem && !mismatch && confirm.length > 0;

  return (
    <form
      className="space-y-3"
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
  );
}

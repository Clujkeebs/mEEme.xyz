'use client';

import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ForgotPasswordForm({ available }: { available: boolean }) {
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  if (!available) {
    return (
      <p className="border-l-2 border-l-warn bg-warn/[0.06] px-4 py-3 text-sm leading-relaxed text-warn">
        Password reset is not switched on for this deployment yet — it needs an email provider. If
        you are locked out, email{' '}
        <a href="mailto:clujkeebs@aol.com" className="underline underline-offset-4">
          clujkeebs@aol.com
        </a>{' '}
        and we will sort it out by hand.
      </p>
    );
  }

  if (sent) {
    return (
      <p className="border-l-2 border-l-primary bg-primary/[0.05] px-4 py-3 text-sm leading-relaxed">
        If there is an account on that address, a reset link is on its way. It works once and
        expires in an hour. Check spam before requesting another — each new request kills the
        previous link.
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void fetch('/api/auth/reset-request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
        })
          .then(async (res) => {
            const json = (await res.json()) as { ok: boolean; error?: string };
            // The success case is deliberately identical whether or not the
            // address has an account — see the route for why.
            if (json.ok) setSent(true);
            else toast.error(json.error ?? 'Could not send the reset link.');
          })
          .catch(() => toast.error('Could not reach the server. Try again.'))
          .finally(() => setBusy(false));
      }}
    >
      <div>
        <label className="hud-label mb-1 block" htmlFor="reset-email">
          email
        </label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          placeholder="you@example.com"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !email}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Send reset link
      </Button>
    </form>
  );
}

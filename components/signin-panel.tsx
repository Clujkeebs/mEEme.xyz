'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export function SignInPanel({ googleEnabled }: { googleEnabled: boolean }) {
  return (
    <div className="mx-auto max-w-md py-20">
      <div className="hud-panel corner-bracket p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          m<span className="text-primary text-glow">EE</span>me
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to track positions, keep your signal history, and get exit alerts while you sleep.
        </p>

        {googleEnabled ? (
          <Button className="mt-8 w-full" size="lg" onClick={() => void signIn('google', { callbackUrl: '/dashboard' })}>
            Continue with Google
          </Button>
        ) : (
          <p className="mt-8 rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm text-warn">
            Sign-in is not configured on this deployment. Set{' '}
            <code className="rounded bg-black/30 px-1">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="rounded bg-black/30 px-1">GOOGLE_CLIENT_SECRET</code> to enable it. The
            Target Lock still works without an account.
          </p>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          No wallet connection, ever. mEEme reads public chain data — it never asks you to sign a
          transaction, and it cannot move your funds.
        </p>
      </div>
    </div>
  );
}

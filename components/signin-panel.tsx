'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SignInPanel({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Enter an email and password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) {
          toast.error(json.error ?? 'Could not create that account.');
          return;
        }
      }

      const result = await signIn('credentials', { email, password, redirect: false });
      if (!result || result.error) {
        toast.error(
          mode === 'signup'
            ? 'Account created, but sign-in failed — try signing in below.'
            : 'Wrong email or password.',
        );
        if (mode === 'signup') setMode('signin');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-20">
      <div className="hud-panel corner-bracket p-8 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">
          m<span className="text-primary text-glow">EE</span>me
          <span className="text-muted-foreground/70">.xyz</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to track positions, keep your signal history, and get exit alerts while you sleep.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3 text-left">
          <Input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <Input
            type="password"
            placeholder={mode === 'signup' ? 'Password (min. 8 characters)' : 'Password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          disabled={busy}
        >
          {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>

        {googleEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              size="lg"
              onClick={() => void signIn('google', { callbackUrl: '/dashboard' })}
            >
              Continue with Google
            </Button>
          </>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          No wallet connection, ever. mEEme reads public chain data — it never asks you to sign a
          transaction, and it cannot move your funds.
        </p>
      </div>
    </div>
  );
}

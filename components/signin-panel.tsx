'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PROMO_STORAGE_KEY } from '@/lib/promo-storage';

export function SignInPanel({
  googleEnabled,
  next = '/dashboard',
}: {
  googleEnabled: boolean;
  next?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [promoCode, setPromoCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // A code from a `?promo=` link (captured by PromoBanner into localStorage)
  // shows up here pre-filled, so someone who clicks a promo link straight
  // into "create account" doesn't have to go find and retype it.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(PROMO_STORAGE_KEY);
      if (stored) setPromoCode(stored);
    } catch {
      // No stored code reachable — leave the field blank, the normal default.
    }
  }, []);

  // Mirrored to localStorage on every keystroke — not just captured from a
  // link — so a code typed by hand still gets redeemed if the visitor clicks
  // "Continue with Google" instead of submitting this form: that path skips
  // this component's own submit handler entirely, but PromoBanner's
  // auto-redeem effect (mounted globally) picks up anything sitting here the
  // moment the OAuth redirect lands them back signed in.
  const handlePromoChange = (value: string) => {
    setPromoCode(value);
    try {
      const trimmed = value.trim();
      if (trimmed) localStorage.setItem(PROMO_STORAGE_KEY, trimmed.toUpperCase());
      else localStorage.removeItem(PROMO_STORAGE_KEY);
    } catch {
      // Private browsing or a full quota — the field still works for the
      // credentials submit path below, it just won't survive a Google
      // redirect.
    }
  };

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
            ? 'Account created, but sign-in failed. Try signing in below.'
            : 'Wrong email or password.',
        );
        if (mode === 'signup') setMode('signin');
        return;
      }

      // The account exists and is signed in now, so redemption has somewhere
      // to attach to. A bad code here is not worth blocking signup over —
      // report it and let them land on the dashboard either way, where
      // "Have a promo code?" is still there if they want another attempt.
      if (mode === 'signup' && promoCode.trim()) {
        try {
          const redeemRes = await fetch('/api/promo/redeem', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: promoCode }),
          });
          const redeemJson = (await redeemRes.json()) as {
            ok: boolean;
            error?: string;
            trialTier?: string;
          };
          if (redeemJson.ok) {
            toast.success(`${promoCode.trim().toUpperCase()} applied. ${redeemJson.trialTier} unlocked, on us.`);
          } else {
            toast.error(redeemJson.error ?? 'Could not redeem that code.');
          }
        } catch {
          toast.error('Account created, but the promo code could not be applied. Try it again from Watchtower.');
        } finally {
          try {
            localStorage.removeItem(PROMO_STORAGE_KEY);
          } catch {
            // Best-effort cleanup only.
          }
        }
      }

      router.push(next);
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
          {/* Real labels, matching the rest of the app. A placeholder is not a
              label — it disappears the moment someone types, leaving no way to
              tell the fields apart, and assistive technology treats it as a
              hint rather than a name. This is the form the whole funnel passes
              through, so it is the last place to be clever about it. */}
          <div>
            <label className="hud-label mb-1 block" htmlFor="signin-email">
              email
            </label>
            <Input
              id="signin-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label className="hud-label mb-1 block" htmlFor="signin-password">
              password{mode === 'signup' ? ' (min. 8 characters)' : ''}
            </label>
            <Input
              id="signin-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {mode === 'signup' && (
            <div>
              <label className="hud-label mb-1 block" htmlFor="signin-promo">
                promo code (optional)
              </label>
              <Input
                id="signin-promo"
                autoComplete="off"
                className="font-mono text-xs uppercase"
                value={promoCode}
                onChange={(e) => handlePromoChange(e.target.value)}
                disabled={busy}
              />
            </div>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4">
          <button
            type="button"
            className="-mx-1 px-1 py-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
            disabled={busy}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
          {/* Only on the sign-in side: offering "forgot your password" to
              someone creating an account is noise. */}
          {mode !== 'signup' && (
            <Link
              href="/signin/forgot"
              className="-mx-1 px-1 py-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Forgot your password?
            </Link>
          )}
        </div>

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
              onClick={() => void signIn('google', { callbackUrl: next })}
            >
              Continue with Google
            </Button>
          </>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          No wallet connection, ever. mEEme reads public chain data. It never asks you to sign a
          transaction, and it cannot move your funds.
        </p>
      </div>
    </div>
  );
}

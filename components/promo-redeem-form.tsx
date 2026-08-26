'use client';

import { Loader2, Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Manual entry point for a signed-in visitor who has a code but did not
 * arrive via a `?promo=` link — e.g. a creator says "use code X" out loud
 * rather than posting a clickable one.
 */
export function PromoRedeemForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; trialTier?: string };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not redeem that code.');
        return;
      }
      toast.success(`Code applied — ${json.trialTier} unlocked, on us.`);
      setCode('');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Ticket className="h-3 w-3" aria-hidden="true" />
        Have a promo code?
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="CODE"
        className="h-8 w-32 font-mono text-xs uppercase"
        autoFocus
      />
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : 'Apply'}
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );
}

'use client';

import { CreditCard, Loader2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CONTACT_EMAIL } from '@/components/legal';

/**
 * The way out of a subscription.
 *
 * The terms of service promise cancellation "from the billing portal linked in
 * your account" and the pricing page promises "no email, no retention flow" —
 * but nothing in the app linked to the portal route at all, so a paying
 * subscriber had no way to cancel. Taking money with no exit is the worst
 * thing a subscription product can ship, and it made both of those statements
 * untrue.
 *
 * If Stripe's portal is unavailable this falls back to a prefilled
 * cancellation email rather than a dead end, so the promise holds either way.
 */
export function ManageBilling() {
  const [busy, setBusy] = React.useState(false);
  const [portalDown, setPortalDown] = React.useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const json = (await res.json()) as {
        ok: boolean;
        url?: string;
        error?: string;
        portalUnavailable?: boolean;
      };

      if (json.ok && json.url) {
        window.location.href = json.url;
        return;
      }

      if (json.portalUnavailable) {
        setPortalDown(true);
        toast.error('Billing portal unavailable — use the cancellation link instead.');
        return;
      }

      toast.error(json.error ?? 'Could not open billing.');
    } catch {
      setPortalDown(true);
      toast.error('Could not reach billing. Use the cancellation link instead.');
    } finally {
      setBusy(false);
    }
  };

  if (portalDown) {
    const subject = encodeURIComponent('Cancel my mEEme subscription');
    const body = encodeURIComponent(
      'Please cancel my mEEme subscription.\n\n(Sent from the Watchtower because the billing portal was unavailable.)',
    );
    return (
      <a
        href={`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`}
        className="inline-flex h-8 items-center gap-2 rounded border border-warn/50 bg-warn/[0.08] px-3 text-xs font-medium text-warn transition-colors hover:bg-warn/[0.14]"
      >
        <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
        Email to cancel
      </a>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void open()} disabled={busy} aria-busy={busy}>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Manage billing
    </Button>
  );
}

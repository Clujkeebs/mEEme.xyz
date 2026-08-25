'use client';

import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TIERS, type Tier } from '@/lib/tiers';
import { cn } from '@/lib/utils';

export function PricingTable({
  currentTier,
  signedIn,
  paymentsLive,
}: {
  currentTier: Tier | null;
  signedIn: boolean;
  paymentsLive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Tier | null>(null);

  const checkout = async (tier: Tier) => {
    if (!signedIn) {
      router.push('/signin');
      return;
    }
    setPending(tier);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (json.ok && json.url) window.location.href = json.url;
      else toast.error(json.error ?? 'Checkout failed.');
    } catch {
      toast.error('Could not reach Stripe.');
    } finally {
      setPending(null);
    }
  };

  const order: Tier[] = ['FREE', 'DEGEN', 'APEX'];

  return (
    <>
      {!paymentsLive && (
        <p className="mx-auto mt-8 max-w-2xl rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-3 text-center text-sm text-warn">
          Payments are not configured on this deployment, so upgrade buttons are inert. Set{' '}
          <code className="rounded bg-black/30 px-1">STRIPE_SECRET_KEY</code> and the price IDs to turn
          them on.
        </p>
      )}

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {order.map((id) => {
          const spec = TIERS[id];
          const isCurrent = currentTier === id;
          const featured = id === 'DEGEN';

          return (
            <div
              key={id}
              className={cn(
                'hud-panel relative flex flex-col p-6',
                featured && 'border-primary/45 shadow-[0_0_40px_-20px_rgba(0,224,138,0.7)]',
              )}
            >
              {featured && (
                <Badge className="absolute -top-2.5 left-6">most traders land here</Badge>
              )}

              <h3 className="text-lg font-bold">{spec.name}</h3>
              <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">{spec.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="tnum text-4xl font-bold">
                  {spec.priceUsd === 0 ? 'Free' : `$${spec.priceUsd}`}
                </span>
                {spec.priceUsd > 0 && <span className="text-sm text-muted-foreground">/mo</span>}
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {spec.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/85">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Your plan
                  </Button>
                ) : id === 'FREE' ? (
                  <Button variant="ghost" className="w-full" disabled>
                    Always available
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={featured ? 'default' : 'outline'}
                    disabled={!paymentsLive || pending !== null}
                    onClick={() => void checkout(id)}
                  >
                    {pending === id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {signedIn ? `Upgrade to ${spec.name}` : `Sign in to get ${spec.name}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
        Cancel any time from the billing portal — no email, no retention flow. If mEEme is not making
        you money, it should not be taking yours.
      </p>
    </>
  );
}

'use client';

import { ArrowRight, Bell, Check, Crosshair, Eye } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * What a brand-new Watchtower shows instead of two dashed "nothing here" boxes.
 *
 * An empty dashboard that only states its own emptiness is the worst moment in
 * the product: the user has just signed up, the left column collapses to a few
 * hundred pixels of nothing, and there is no indication of what to do first.
 * This replaces that with the three things that actually have to happen for
 * the Watchtower to be worth anything — and it ticks them off as they do,
 * so it doubles as a progress checklist rather than vanishing after one use.
 */
export function FirstRun({
  hasPositions,
  hasWatches,
  alertsReady,
}: {
  hasPositions: boolean;
  hasWatches: boolean;
  alertsReady: boolean;
}) {
  const steps = [
    {
      done: hasPositions,
      icon: Crosshair,
      title: 'Track something you hold',
      body:
        'Tell the engine what you own and it re-reads the ladder and the stop for it every few minutes — that is the whole point of this page.',
      action: null,
      hint: 'Use “track a position” on the right, or import a wallet above.',
    },
    {
      done: hasWatches,
      icon: Eye,
      title: 'Put a token under surveillance',
      body:
        'No position needed. The sweep watches its coil score and wakes you when it crosses your threshold.',
      action: null,
      hint: 'Use “watch a token” on the right.',
    },
    {
      done: alertsReady,
      icon: Bell,
      title: 'Give the alerts somewhere to land',
      body:
        'An alert that only exists in a database is not an alert. Connect Telegram or turn on email so a breaking stop reaches you in seconds.',
      action: null,
      hint: 'Set it up under “where alerts go”.',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="hud-panel corner-bracket p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="hud-label">get the watchtower working</h2>
        <span className="tnum font-mono text-[11px] text-muted-foreground">
          {doneCount} / {steps.length} done
        </span>
      </div>

      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        The Target Lock gives you a read on demand. The Watchtower is the half that runs without
        you — but only once it knows what to watch and where to reach you.
      </p>

      <ol className="mt-5 space-y-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className={cn(
                'flex gap-3.5 rounded-lg border px-4 py-3.5 transition-colors',
                step.done ? 'border-primary/30 bg-primary/[0.05]' : 'border-border/70',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                  step.done
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    step.done ? 'text-foreground/70 line-through decoration-primary/40' : 'text-foreground',
                  )}
                >
                  {step.title}
                </p>
                {!step.done && (
                  <>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
                    <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/70">{step.hint}</p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
        <Button asChild size="sm">
          <Link href="/lock">
            <Crosshair className="h-3.5 w-3.5" /> Run a Target Lock
          </Link>
        </Button>
        <Link
          href="/blog/coiled-and-trapped-supply"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          How the read works <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}

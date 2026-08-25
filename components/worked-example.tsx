import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { SupplyProfile } from '@/components/cockpit/supply-profile';
import { VERDICT_META } from '@/lib/engine/verdict';
import type { AlphaSignal } from '@/lib/engine/types';
import { formatPct, formatPrice } from '@/lib/utils';

/**
 * A real read, on the landing page, rendered by the same engine that serves the
 * app — not a screenshot and not a mockup.
 *
 * The previous landing page asserted that the mechanic worked and showed
 * nothing. For a tool asking a stranger to trust it with exit decisions, the
 * argument has to be visible above the fold.
 */
export function WorkedExample({ signal, demo }: { signal: AlphaSignal; demo: boolean }) {
  const meta = VERDICT_META[signal.verdict];
  const coil = signal.coil;
  const ladder = signal.ladder;

  const tone = {
    apex: 'text-primary',
    good: 'text-primary',
    neutral: 'text-hud',
    warn: 'text-warn',
    danger: 'text-destructive',
  }[meta.tone];

  return (
    <div className="hud-panel corner-bracket overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="hud-label">worked example</span>
          <Badge variant="muted">${signal.snapshot.symbol}</Badge>
        </div>
        {demo && <Badge variant="warn">demo token</Badge>}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4 p-5">
          <div>
            <div className={`text-2xl font-bold tracking-tight sm:text-3xl ${tone}`}>{meta.label}</div>
            <p className="mt-1.5 text-sm text-foreground/85">{signal.headline}</p>
          </div>

          <ul className="space-y-2">
            {signal.reasoning.slice(0, 4).map((line, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>

          {ladder && (
            <div className="rounded border border-primary/25 bg-primary/[0.04] p-3">
              <div className="hud-label mb-1.5">the plan</div>
              <p className="text-[13px] leading-relaxed text-foreground/90">{ladder.summary}</p>
            </div>
          )}
        </div>

        <div className="border-t border-border/70 p-5 lg:border-l lg:border-t-0">
          <div className="hud-label mb-2">who still has to sell</div>
          <SupplyProfile
            shelves={coil.shelves}
            spotUsd={signal.snapshot.priceUsd}
            trapdoorUsd={coil.trapdoorUsd}
            ceilingUsd={coil.ceilingUsd}
          />
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <Stat label="coiled" value={formatPct(coil.coiledSupply)} className="text-coil" />
            <Stat label="trapped" value={formatPct(coil.trappedSupply)} className="text-trap" />
            <Stat label="insider coil" value={formatPct(coil.insiderCoil)} className="text-warn" />
            <Stat
              label="trapdoor"
              value={coil.trapdoorUsd ? formatPrice(coil.trapdoorUsd) : '—'}
              className="text-coil"
            />
          </dl>
        </div>
      </div>

      <div className="border-t border-border/70 px-5 py-3">
        <Link
          href={`/lock?address=${signal.snapshot.address}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          Open this in the cockpit <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/40 px-2 py-1.5">
      <dt className="hud-label">{label}</dt>
      <dd className={`tnum font-mono text-xs font-semibold ${className}`}>{value}</dd>
    </div>
  );
}

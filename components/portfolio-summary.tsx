'use client';

import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortfolioSummary as Summary } from '@/lib/positions';

function usd(n: number): string {
  const sign = n < 0 ? '\u2212' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${usd(n)}`;
}

function pct(fraction: number): string {
  return `${fraction >= 0 ? '+' : '\u2212'}${Math.abs(fraction * 100).toFixed(1)}%`;
}

export function markAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The number a trader opens this page for.
 *
 * Deliberately shows unrealized and realized side by side rather than one
 * blended "total": they are not the same kind of money. Unrealized is a
 * marked opinion that can evaporate before you act on it; realized already
 * happened. Merging them is how a dashboard flatters someone into holding.
 */
export function PortfolioSummaryPanel({ summary }: { summary: Summary }) {
  const hasAnything = summary.openCount > 0 || summary.closedCount > 0;
  if (!hasAnything) return null;

  const unrealizedUp = summary.unrealizedPnlUsd >= 0;
  const realizedUp = summary.realizedPnlUsd >= 0;

  return (
    <section className="hud-panel corner-bracket p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="hud-label flex items-center gap-2">
          <Activity className="h-3 w-3" aria-hidden="true" /> book
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {summary.openCount === 0 ? (
            'No open positions'
          ) : summary.oldestMarkAgeMs === null ? (
            'Awaiting first mark — the sweep runs every 5 minutes'
          ) : (
            <>
              marked {markAge(summary.oldestMarkAgeMs)}
              {summary.anyStale && <span className="text-destructive"> · some marks are stale</span>}
            </>
          )}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Stat
          label="open value"
          value={summary.openCount === 0 ? '—' : usd(summary.markedValueUsd)}
          sub={
            summary.unmarkedCount > 0
              ? `${summary.unmarkedCount} not marked yet`
              : `${summary.openCount} position${summary.openCount === 1 ? '' : 's'}`
          }
        />
        <Stat
          label="unrealized"
          value={summary.markedCostUsd === 0 ? '—' : signed(summary.unrealizedPnlUsd)}
          tone={summary.markedCostUsd === 0 ? undefined : unrealizedUp ? 'up' : 'down'}
          icon={
            summary.markedCostUsd === 0 ? null : unrealizedUp ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )
          }
          sub={summary.unrealizedPnlPct === null ? 'nothing marked' : pct(summary.unrealizedPnlPct)}
        />
        <Stat
          label="realized"
          value={summary.closedCount === 0 ? '—' : signed(summary.realizedPnlUsd)}
          tone={summary.closedCount === 0 ? undefined : realizedUp ? 'up' : 'down'}
          sub={
            summary.closedCount === 0
              ? 'nothing closed yet'
              : `${summary.closedCount} closed`
          }
        />
        <Stat
          label="win rate"
          value={summary.winRate === null ? '—' : `${(summary.winRate * 100).toFixed(0)}%`}
          sub={
            summary.winRate === null
              ? 'needs a closed trade'
              : `${summary.wins}W · ${summary.losses}L`
          }
        />
      </dl>

      {summary.bestUsd !== null && summary.worstUsd !== null && summary.closedCount > 1 && (
        <p className="mt-4 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
          Best <span className="tnum font-mono text-primary">{signed(summary.bestUsd)}</span> ·
          worst <span className="tnum font-mono text-destructive">{signed(summary.worstUsd)}</span>
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'up' | 'down';
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="hud-label">{label}</dt>
      <dd
        className={cn(
          'tnum mt-1 flex items-center gap-1.5 font-mono text-xl font-semibold tracking-tight',
          tone === 'up' && 'text-primary',
          tone === 'down' && 'text-destructive',
        )}
      >
        {icon}
        {value}
      </dd>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

'use client';

import { Layers, Receipt, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { ExitLadder, LadderExecutionSummary, RungExecutionSummary } from '@/lib/engine/types';
import { cn, formatPrice } from '@/lib/utils';

/**
 * The ladder is the product. Everything else on the page is evidence for it.
 */

export interface LadderCardProps {
  ladder: ExitLadder | null;
  spotUsd: number;
  className?: string;
}

const STOP_TONE = {
  structural: 'text-coil',
  volatility: 'text-warn',
  'inside-noise': 'text-destructive',
} as const;

export function LadderCard({ ladder, spotUsd, className }: LadderCardProps) {
  if (!ladder) {
    return (
      <div className={cn('hud-panel p-6 text-center', className)}>
        <p className="text-sm text-muted-foreground">
          No ladder: this token was called <span className="font-medium text-destructive">NO TOUCH</span>.
          There is no exit plan for a position you were told not to open. Add your position above if
          you already hold it and want an exit plan anyway.
        </p>
      </div>
    );
  }

  const stopDistance = ((ladder.hardStopUsd - spotUsd) / spotUsd) * 100;

  return (
    <div className={cn('hud-panel corner-bracket overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
        <div>
          <h3 className="section-title !text-primary">Exit ladder</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Decided now, so you are not deciding mid-dump.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ladder.execution?.collapsed && (
            <Badge variant="muted" title="Merged because the position could not pay for the extra sells">
              from {ladder.execution.proposedRungs}
            </Badge>
          )}
          <Badge variant="muted">
            {ladder.rungs.length} {ladder.rungs.length === 1 ? 'rung' : 'rungs'}
          </Badge>
        </div>
      </div>

      <ol className="divide-y divide-border/60">
        {ladder.rungs.map((rung, i) => (
          <li key={i} className="flex gap-4 px-6 py-4 transition-colors hover:bg-primary/[0.03]">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/10 font-mono text-[11px] font-semibold text-primary">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tnum text-2xl font-bold leading-none text-foreground">
                  {(rung.fraction * 100).toFixed(0)}%
                </span>
                <span className="tnum text-[15px] text-foreground/85">
                  at {formatPrice(rung.priceUsd)}
                </span>
                {rung.multipleOnEntry !== null && (
                  <Badge variant="default">{rung.multipleOnEntry.toFixed(2)}× entry</Badge>
                )}
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{rung.rationale}</p>
              {ladder.execution?.rungs[i] && <RungCost exec={ladder.execution.rungs[i]!} />}
            </div>
          </li>
        ))}

        {ladder.runnerFraction > 0.005 && (
          <li className="flex gap-4 px-6 py-4">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hud/35 bg-hud/10 font-mono text-[11px] text-hud">
              ∞
            </div>
            <div>
              <span className="tnum text-2xl font-bold leading-none">
                {(ladder.runnerFraction * 100).toFixed(0)}%
              </span>
              <span className="ml-2.5 text-[15px] text-hud">runs</span>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Low enough coil to be worth leaving on. This is the part that pays for the losers.
              </p>
            </div>
          </li>
        )}
      </ol>

      {ladder.execution && <ExecutionPanel execution={ladder.execution} />}

      <div className="border-t border-border/70 bg-destructive/[0.05] px-6 py-4">
        <div className="flex items-start gap-3">
          <TriangleAlert className={cn('mt-0.5 h-4 w-4 shrink-0', STOP_TONE[ladder.stopQuality])} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="hud-label">hard stop</span>
              <span className={cn('tnum text-lg font-bold', STOP_TONE[ladder.stopQuality])}>
                {formatPrice(ladder.hardStopUsd)}
              </span>
              <span className="tnum text-xs text-muted-foreground">
                ({stopDistance.toFixed(1)}%)
              </span>
              {ladder.stopQuality === 'inside-noise' && <Badge variant="danger">no room</Badge>}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{ladder.stopNote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const fmtUsd = (v: number): string =>
  v >= 1000
    ? `$${Math.round(v).toLocaleString('en-US')}`
    : v >= 1
      ? `$${v.toFixed(2)}`
      : `$${v.toFixed(3)}`;

/**
 * What this one rung costs to take. Sits under the rationale rather than beside
 * the price, because it is a second-order fact: the price is the decision, this
 * is what the decision costs.
 */
function RungCost({ exec }: { exec: RungExecutionSummary }) {
  const heavy = exec.costPct >= 0.05;
  return (
    <p className="mt-2 flex flex-col gap-y-0.5 font-mono text-[11px] text-muted-foreground/80 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
      <span className="tnum">{fmtUsd(exec.grossUsd)} gross</span>
      <span aria-hidden="true" className="hidden sm:inline">·</span>
      <span className={cn('tnum', heavy && 'text-warn')}>
        −{fmtUsd(exec.costUsd)} to fees and impact ({(exec.costPct * 100).toFixed(1)}%)
      </span>
      <span aria-hidden="true" className="hidden sm:inline">·</span>
      <span className="tnum text-foreground/70">{fmtUsd(exec.netUsd)} lands</span>
      {exec.clips > 1 && (
        <span className="inline-flex items-center gap-1 text-hud">
          <Layers className="h-3 w-3" aria-hidden="true" />
          work it in ~{exec.clips} orders
        </span>
      )}
    </p>
  );
}

/**
 * The cost of the whole plan.
 *
 * This is the panel that makes the same engine useful at both ends of the
 * market. A ladder built from supply structure alone is size-blind, and a
 * size-blind exit plan quietly lies to the two traders who most need the truth:
 * the one whose position is too small to pay for the sells it prescribes, and
 * the one whose position is large enough to move the price through every level
 * it quotes.
 */
function ExecutionPanel({ execution }: { execution: LadderExecutionSummary }) {
  const breakeven = Number.isFinite(execution.breakevenMultiple)
    ? `${execution.breakevenMultiple.toFixed(2)}×`
    : 'unreachable';
  const tone = execution.sizeConstrained || execution.exitCostPct >= 0.05 ? 'text-warn' : 'text-foreground';

  return (
    <div className="border-t border-border/70 bg-hud/[0.04] px-6 py-4">
      <div className="flex items-start gap-3">
        <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-hud" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="hud-label">what it costs to get out</span>
            {/* Marked to spot, not to what they paid. Someone 10x up has a
                position ten times the size of their entry, and every cost
                below is a function of what it is worth now — labelling this
                "position" alone read as "what you put in". */}
            <span className="tnum text-[13px] text-muted-foreground">
              worth now <span className="text-foreground">{fmtUsd(execution.positionUsd)}</span>
            </span>
            <span className="tnum text-[13px] text-muted-foreground">
              exit costs <span className={cn('font-semibold', tone)}>{(execution.exitCostPct * 100).toFixed(1)}%</span>
            </span>
            <span className="tnum text-[13px] text-muted-foreground">
              breakeven <span className={cn('font-semibold', tone)}>{breakeven}</span> on entry
            </span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{execution.note}</p>
        </div>
      </div>
    </div>
  );
}

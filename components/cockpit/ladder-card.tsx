'use client';

import { TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { ExitLadder } from '@/lib/engine/types';
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
        <Badge variant="muted">{ladder.rungs.length} rungs</Badge>
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

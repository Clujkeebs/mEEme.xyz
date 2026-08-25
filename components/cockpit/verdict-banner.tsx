'use client';

import { AlertTriangle, ArrowDownRight, Crosshair, Hand, ShieldOff, TrendingUp, Zap } from 'lucide-react';
import * as React from 'react';
import { VERDICT_META } from '@/lib/engine/verdict';
import type { Verdict } from '@/lib/engine/types';
import { cn, formatCountdown } from '@/lib/utils';

const ICONS: Record<Verdict, React.ComponentType<{ className?: string }>> = {
  APEX_ENTRY: Crosshair,
  SCALE_IN: TrendingUp,
  HOLD_THROUGH_NOISE: Hand,
  ARM_EXIT: AlertTriangle,
  SCALE_OUT_NOW: ArrowDownRight,
  EXIT_IMMEDIATELY: Zap,
  NO_TOUCH: ShieldOff,
};

const TONE_STYLES = {
  apex: 'border-primary/50 bg-primary/[0.07] text-primary',
  good: 'border-primary/35 bg-primary/[0.05] text-primary',
  neutral: 'border-hud/35 bg-hud/[0.05] text-hud',
  warn: 'border-warn/45 bg-warn/[0.07] text-warn',
  danger: 'border-destructive/50 bg-destructive/[0.08] text-destructive',
} as const;

export interface VerdictBannerProps {
  verdict: Verdict;
  conviction: number;
  headline: string;
  halfLifeMinutes: number;
  className?: string;
}

export function VerdictBanner({
  verdict,
  conviction,
  headline,
  halfLifeMinutes,
  className,
}: VerdictBannerProps) {
  const meta = VERDICT_META[verdict];
  const Icon = ICONS[verdict];
  const tone = TONE_STYLES[meta.tone];
  const urgent = meta.tone === 'danger';

  return (
    <div className={cn('corner-bracket relative overflow-hidden rounded-lg border p-5', tone, className)}>
      {urgent && (
        <div className="scanline top-0 animate-sweep" aria-hidden />
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon className={cn('mt-0.5 h-7 w-7 shrink-0', urgent && 'animate-flicker')} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{meta.label}</h2>
            <p className="mt-1 max-w-xl text-sm opacity-90">{meta.imperative}</p>
          </div>
        </div>

        <div className="text-right">
          <div className="hud-label">conviction</div>
          <div className="tnum text-2xl font-bold">{(conviction * 100).toFixed(0)}%</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider opacity-70">
            re-check in {formatCountdown(halfLifeMinutes)}
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-current/15 pt-3 text-sm text-foreground/85">{headline}</p>
    </div>
  );
}

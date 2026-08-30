'use client';

import { AlertTriangle, ArrowDownRight, Crosshair, Hand, Minus, ShieldOff, TrendingUp, Zap } from 'lucide-react';
import * as React from 'react';
import { CoilGauge } from './coil-gauge';
import { VERDICT_META } from '@/lib/engine/verdict';
import type { Verdict } from '@/lib/engine/types';
import { cn, formatCountdown } from '@/lib/utils';

const ICONS: Record<Verdict, React.ComponentType<{ className?: string }>> = {
  NO_SIGNAL: Minus,
  APEX_ENTRY: Crosshair,
  SCALE_IN: TrendingUp,
  HOLD_THROUGH_NOISE: Hand,
  ARM_EXIT: AlertTriangle,
  SCALE_OUT_NOW: ArrowDownRight,
  EXIT_IMMEDIATELY: Zap,
  NO_TOUCH: ShieldOff,
};

/**
 * Each tone carries its own surface, not just a text colour. A trader glancing
 * at this mid-position should know the answer from the colour of the card
 * before a single word is read. The glow is a held-off ambient shadow rather
 * than a neon outline now — enough to tint the space around the card without
 * turning the single most important number on the page into a light show.
 */
const TONE = {
  apex: {
    text: 'text-primary',
    border: 'border-primary/45',
    surface: 'from-primary/[0.13] via-primary/[0.04] to-transparent',
    glow: 'shadow-[0_24px_56px_-36px_rgba(0,240,160,0.4)]',
  },
  good: {
    text: 'text-primary',
    border: 'border-primary/35',
    surface: 'from-primary/[0.09] via-primary/[0.03] to-transparent',
    glow: 'shadow-[0_20px_48px_-34px_rgba(0,240,160,0.3)]',
  },
  neutral: {
    text: 'text-hud',
    border: 'border-hud/35',
    surface: 'from-hud/[0.08] via-hud/[0.02] to-transparent',
    glow: '',
  },
  warn: {
    text: 'text-warn',
    border: 'border-warn/45',
    surface: 'from-warn/[0.12] via-warn/[0.04] to-transparent',
    glow: 'shadow-[0_20px_48px_-32px_rgba(255,176,32,0.32)]',
  },
  danger: {
    text: 'text-destructive',
    border: 'border-destructive/50',
    surface: 'from-destructive/[0.15] via-destructive/[0.05] to-transparent',
    glow: 'shadow-[0_24px_56px_-32px_rgba(255,70,60,0.4)]',
  },
} as const;

export interface VerdictBannerProps {
  verdict: Verdict;
  conviction: number;
  headline: string;
  halfLifeMinutes: number;
  /** When supplied, the gauge sits inside the verdict rather than in a separate card. */
  coilScore?: number;
  confidence?: number;
  className?: string;
}

export function VerdictBanner({
  verdict,
  conviction,
  headline,
  halfLifeMinutes,
  coilScore,
  confidence,
  className,
}: VerdictBannerProps) {
  const meta = VERDICT_META[verdict];
  const Icon = ICONS[verdict];
  const tone = TONE[meta.tone];
  const urgent = meta.tone === 'danger';
  const showGauge = coilScore !== undefined && confidence !== undefined;

  return (
    <section
      className={cn(
        'hud-panel-hero corner-bracket relative overflow-hidden border',
        tone.border,
        tone.glow,
        className,
      )}
      aria-label={`Verdict: ${meta.label}`}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br', tone.surface)} aria-hidden />
      {urgent && <div className="scanline top-0" aria-hidden />}

      <div className="relative flex flex-col gap-7 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Icon className={cn('h-5 w-5 shrink-0', tone.text)} />
            <span className={cn('hud-label !text-[11px]', tone.text, '!opacity-90')}>the call</span>
          </div>

          <h2
            className={cn(
              'mt-2.5 font-display text-[2.1rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[2.75rem]',
              tone.text,
            )}
          >
            {meta.label}
          </h2>

          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/90">
            {meta.imperative}
          </p>

          <p className="mt-4 border-t border-white/[0.07] pt-4 text-[15px] leading-relaxed text-muted-foreground">
            {headline}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-7 lg:flex-col lg:items-end lg:gap-5">
          {showGauge && <CoilGauge score={coilScore} confidence={confidence} size={158} />}

          <div className="lg:text-right">
            <div className="hud-label">conviction</div>
            <div className={cn('tnum text-3xl font-bold leading-none', tone.text)}>
              {(conviction * 100).toFixed(0)}%
            </div>
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              re-check in {formatCountdown(halfLifeMinutes)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

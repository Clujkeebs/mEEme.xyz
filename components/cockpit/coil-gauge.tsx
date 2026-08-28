'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The coil gauge. One number, read at a glance, before any text is processed.
 *
 * Drawn as an arc rather than a bar because the reading that matters is
 * "how far round is it", and an arc makes the extremes unmistakable in
 * peripheral vision — which is the only attention a trader has mid-position.
 */

export interface CoilGaugeProps {
  /** 0..1 */
  score: number;
  /** 0..1 — drawn as a dimming of the whole gauge, never as a separate number. */
  confidence: number;
  size?: number;
  className?: string;
}

const ARC_START = 135;
const ARC_SWEEP = 270;

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, startDeg + sweepDeg);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export function colorForCoil(score: number): string {
  if (score >= 0.68) return '#ff4a3d';
  if (score >= 0.5) return '#ffb020';
  if (score >= 0.28) return '#7cf7d4';
  return '#00f0a0';
}

export function CoilGauge({ score, confidence, size = 168, className }: CoilGaugeProps) {
  const clamped = Math.max(0, Math.min(1, score));

  /*
   * The arc already transitions between scores, but on first paint it was
   * simply there — the one number a trader looks at first arrived with no
   * movement at all. Sweeping it up from zero on mount reads as the gauge
   * taking a measurement. It only runs when the page opted into motion; with
   * reduced motion the arc renders at its true value immediately, because a
   * gauge stuck at zero would be a wrong reading, not a calmer one.
   */
  const [swept, setSwept] = React.useState(true);
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.documentElement.getAttribute('data-motion') !== 'on') return;
    setSwept(false);
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setSwept(true)));
    return () => cancelAnimationFrame(frame);
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;
  const color = colorForCoil(clamped);

  const circumference = (ARC_SWEEP / 360) * 2 * Math.PI * r;
  const filled = circumference * clamped;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} role="img" aria-label={`Coil score ${clamped.toFixed(2)}`}>
        {/* Track */}
        <path
          d={arcPath(cx, cy, r, ARC_START, ARC_SWEEP)}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Threshold ticks at the verdict boundaries, so the number has meaning. */}
        {[0.28, 0.5, 0.68, 0.85].map((t) => {
          const [x1, y1] = polar(cx, cy, r - 9, ARC_START + ARC_SWEEP * t);
          const [x2, y2] = polar(cx, cy, r + 9, ARC_START + ARC_SWEEP * t);
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              opacity={0.35}
            />
          );
        })}
        {/* Fill */}
        <path
          d={arcPath(cx, cy, r, ARC_START, ARC_SWEEP)}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${swept ? filled : 0} ${circumference}`}
          style={{
            filter: `drop-shadow(0 0 14px ${color}99)`,
            opacity: 0.35 + 0.65 * Math.max(0, Math.min(1, confidence)),
            transition: 'stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)',
          }}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="hud-label !tracking-[0.22em]">coil</span>
        <span
          className="tnum mt-0.5 text-[2.6rem] font-bold leading-none"
          style={{ color, textShadow: `0 0 26px ${color}55` }}
        >
          {clamped.toFixed(2)}
        </span>
        <span className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {(confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
    </div>
  );
}

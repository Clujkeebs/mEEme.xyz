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
  if (score >= 0.68) return '#ff3b30';
  if (score >= 0.5) return '#ffb020';
  if (score >= 0.28) return '#7cf7d4';
  return '#00e08a';
}

export function CoilGauge({ score, confidence, size = 168, className }: CoilGaugeProps) {
  const clamped = Math.max(0, Math.min(1, score));
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
          strokeWidth={9}
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
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{
            filter: `drop-shadow(0 0 10px ${color}88)`,
            opacity: 0.35 + 0.65 * Math.max(0, Math.min(1, confidence)),
            transition: 'stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1)',
          }}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="hud-label">coil</span>
        <span className="tnum text-4xl font-bold leading-none" style={{ color }}>
          {clamped.toFixed(2)}
        </span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {(confidence * 100).toFixed(0)}% conf
        </span>
      </div>
    </div>
  );
}

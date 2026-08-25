'use client';

import * as React from 'react';
import type { SupplyShelf } from '@/lib/engine/types';
import { cn, formatPct, formatPrice } from '@/lib/utils';

/**
 * The supply profile — the picture the whole product is built around.
 *
 * Price runs up the vertical axis on a log scale, because memecoin cost bases
 * span orders of magnitude and a linear axis would collapse the entire early
 * cohort into a single bar. Each bar is a block of supply sitting at that cost:
 *
 *   Below spot, in red   — coiled. In profit, and able to sell into you.
 *   Above spot, in blue  — trapped. Underwater, and structurally unwilling to.
 *
 * The two annotated levels are the trade. The trapdoor is the largest block of
 * in-profit supply: break it and those holders go to breakeven at once. The
 * ceiling is where trapped bags get whole and start selling into strength.
 */

export interface SupplyProfileProps {
  shelves: SupplyShelf[];
  spotUsd: number;
  trapdoorUsd: number | null;
  ceilingUsd: number | null;
  /** The viewer's own cost basis, drawn as a reference line when known. */
  entryUsd?: number | null;
  className?: string;
}

const HEIGHT = 320;
const LABEL_WIDTH = 74;
const BAR_AREA = 200;
const PADDING_Y = 18;
/** Right-hand gutter the level markers live in, clear of the bars. */
const GUTTER = 96;
const CHART_WIDTH = LABEL_WIDTH + BAR_AREA + GUTTER;
/** Minimum vertical gap between two level labels before we nudge them apart. */
const LABEL_MIN_GAP = 12;

interface LevelMarker {
  y: number;
  labelY: number;
  text: string;
  color: string;
  /** Levels are drawn full width; entry and spot are dashed references. */
  dash?: string;
}

/**
 * Level labels are computed from independent prices, so two of them can land on
 * the same pixel. Sort by position and push each one down until it clears the
 * previous — the line stays at the true price, only the text moves.
 */
function declutter(markers: LevelMarker[]): LevelMarker[] {
  const sorted = [...markers].sort((a, b) => a.labelY - b.labelY);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && cur.labelY - prev.labelY < LABEL_MIN_GAP) {
      cur.labelY = prev.labelY + LABEL_MIN_GAP;
    }
  }
  return sorted;
}

export function SupplyProfile({
  shelves,
  spotUsd,
  trapdoorUsd,
  ceilingUsd,
  entryUsd,
  className,
}: SupplyProfileProps) {
  const geometry = React.useMemo(() => {
    if (shelves.length === 0 || spotUsd <= 0) return null;

    const prices = shelves.map((s) => s.priceUsd).filter((p) => p > 0);
    // Always include spot so the marker is never off-canvas.
    const lo = Math.min(...prices, spotUsd) * 0.9;
    const hi = Math.max(...prices, spotUsd) * 1.1;
    if (!(lo > 0) || !(hi > lo)) return null;

    const logLo = Math.log(lo);
    const logHi = Math.log(hi);
    const span = logHi - logLo;

    // Higher price at the top, like every chart a trader has ever read.
    const y = (price: number): number =>
      PADDING_Y + (1 - (Math.log(Math.max(price, lo)) - logLo) / span) * (HEIGHT - PADDING_Y * 2);

    const maxFraction = Math.max(...shelves.map((s) => s.supplyFraction), 0.01);
    const width = (fraction: number): number => Math.max(2, (fraction / maxFraction) * BAR_AREA);

    return { y, width, maxFraction };
  }, [shelves, spotUsd]);

  if (!geometry) {
    return (
      <div
        className={cn(
          'flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border/70 px-6 text-center',
          className,
        )}
      >
        <p className="max-w-xs text-sm text-muted-foreground">
          No cost basis could be reconstructed for this token, so there is no supply profile to draw.
          Add a Helius key to turn this on.
        </p>
      </div>
    );
  }

  const { y, width } = geometry;
  const spotY = y(spotUsd);

  const markers = declutter(
    [
      { y: spotY, labelY: spotY - 5, text: `SPOT ${formatPrice(spotUsd)}`, color: 'hsl(var(--primary))', dash: '4 3' },
      entryUsd && entryUsd > 0
        ? { y: y(entryUsd), labelY: y(entryUsd) - 5, text: 'YOUR ENTRY', color: '#7cf7d4', dash: '2 4' }
        : null,
      trapdoorUsd !== null && trapdoorUsd > 0
        ? { y: y(trapdoorUsd), labelY: y(trapdoorUsd) - 5, text: 'TRAPDOOR', color: '#ff3b30' }
        : null,
      ceilingUsd !== null && ceilingUsd > 0
        ? { y: y(ceilingUsd), labelY: y(ceilingUsd) - 5, text: 'CEILING', color: '#2f6fed' }
        : null,
    ].filter((m): m is LevelMarker => m !== null),
  );

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Supply profile: coiled supply below spot, trapped supply above"
      >
        <defs>
          <linearGradient id="coilBar" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff3b30" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ff3b30" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="trapBar" x1="0" x2="1">
            <stop offset="0%" stopColor="#2f6fed" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#2f6fed" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {shelves.map((shelf, i) => {
          const barY = y(shelf.priceUsd);
          const barWidth = width(shelf.supplyFraction);
          const isCoiled = shelf.kind === 'coiled';
          return (
            <g key={`${shelf.priceUsd}-${i}`}>
              <rect
                x={LABEL_WIDTH}
                y={barY - 4}
                width={barWidth}
                height={8}
                rx={2}
                fill={isCoiled ? 'url(#coilBar)' : 'url(#trapBar)'}
              />
              {/* Insider share is drawn as a solid core inside the bar — you can
                  see at a glance how much of a shelf is one coordinated actor. */}
              {shelf.insiderShare > 0.02 && (
                <rect
                  x={LABEL_WIDTH}
                  y={barY - 4}
                  width={Math.max(2, barWidth * shelf.insiderShare)}
                  height={8}
                  rx={2}
                  fill="#ffb020"
                  opacity={0.9}
                />
              )}
              <text
                x={LABEL_WIDTH - 8}
                y={barY + 3}
                textAnchor="end"
                className="fill-muted-foreground font-mono text-[9px]"
              >
                {formatPrice(shelf.priceUsd)}
              </text>
              {/* A long bar would push its label into the right gutter and
                  collide with the trapdoor and ceiling names, so past a certain
                  length the label moves inside the bar instead. */}
              {barWidth > BAR_AREA * 0.82 ? (
                <text
                  x={LABEL_WIDTH + barWidth - 5}
                  y={barY + 3}
                  textAnchor="end"
                  className="fill-background font-mono text-[9px] font-semibold"
                >
                  {formatPct(shelf.supplyFraction, 1)}
                </text>
              ) : (
                <text
                  x={LABEL_WIDTH + barWidth + 6}
                  y={barY + 3}
                  className="fill-muted-foreground/80 font-mono text-[9px]"
                >
                  {formatPct(shelf.supplyFraction, 1)}
                </text>
              )}
            </g>
          );
        })}

        {markers.map((m) => (
          <g key={m.text}>
            <line
              x1={m.dash ? 0 : LABEL_WIDTH - 4}
              x2={CHART_WIDTH - 4}
              y1={m.y}
              y2={m.y}
              stroke={m.color}
              strokeWidth={m.dash ? 1.5 : 1}
              strokeDasharray={m.dash}
            />
            <text
              x={CHART_WIDTH - 4}
              y={m.labelY}
              textAnchor="end"
              className="font-mono text-[9px] uppercase tracking-wider"
              fill={m.color}
            >
              {m.text}
            </text>
          </g>
        ))}

      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legend color="#ff3b30" label="Coiled — in profit, can sell into you" />
        <Legend color="#2f6fed" label="Trapped — underwater, structural support" />
        <Legend color="#ffb020" label="Insider-held share of a shelf" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

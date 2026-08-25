'use client';

import {
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import * as React from 'react';
import type { Candle, ExitLadder } from '@/lib/engine/types';
import { cn, formatPrice } from '@/lib/utils';

/**
 * Price context with the engine's own levels drawn on top of it.
 *
 * A bare candlestick chart is a commodity — every competitor has one. What
 * makes this one worth looking at is that the trapdoor, the ceiling and each
 * ladder rung are marked on the axis, so the plan and the price live in the
 * same picture instead of in two tabs.
 */

export interface PriceChartProps {
  candles: Candle[];
  trapdoorUsd: number | null;
  ceilingUsd: number | null;
  ladder: ExitLadder | null;
  entryUsd?: number | null;
  className?: string;
  height?: number;
}

export function PriceChart({
  candles,
  trapdoorUsd,
  ceilingUsd,
  ladder,
  entryUsd,
  className,
  height = 300,
}: PriceChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<'Candlestick'> | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    // Memecoin prices run from $40 to $0.000000000012, so precision has to be
    // derived from the data. A fixed 10 decimals makes the axis unreadable and,
    // worse, gives the tick generator a minMove of 1e-10 — which is what makes
    // it start the scale at zero and squash the candles into a strip.
    const highest = Math.max(...candles.map((c) => c.high), 1e-12);
    const precision = highest >= 1 ? 4 : Math.min(12, Math.abs(Math.floor(Math.log10(highest))) + 4);
    const minMove = Number(`1e-${precision}`);

    /** Compact axis labels: three significant figures is all anyone reads off an axis. */
    const priceFormatter = (price: number): string => {
      if (!Number.isFinite(price)) return '';
      if (price >= 1) return price.toFixed(3);
      if (price <= 0) return '0';
      return price.toPrecision(3);
    };

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(180,195,200,0.65)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(124,247,212,0.04)' },
        horzLines: { color: 'rgba(124,247,212,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(124,247,212,0.12)',
        // Keep the candles filling the pane instead of letting autoscale pad
        // the range out toward zero once the level lines are added.
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: { borderColor: 'rgba(124,247,212,0.12)', timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: 'rgba(0,224,138,0.4)', labelBackgroundColor: '#00e08a' },
        horzLine: { color: 'rgba(0,224,138,0.4)', labelBackgroundColor: '#00e08a' },
      },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      localization: { priceFormatter },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#00e08a',
      downColor: '#ff3b30',
      borderUpColor: '#00e08a',
      borderDownColor: '#ff3b30',
      wickUpColor: 'rgba(0,224,138,0.65)',
      wickDownColor: 'rgba(255,59,48,0.65)',
      priceFormat: { type: 'price', precision, minMove },
    });

    series.setData(
      candles.map((c) => ({
        time: c.timeSec as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    if (trapdoorUsd !== null && trapdoorUsd > 0) {
      series.createPriceLine({
        price: trapdoorUsd,
        color: '#ff3b30',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'TRAPDOOR',
      });
    }

    if (ceilingUsd !== null && ceilingUsd > 0) {
      series.createPriceLine({
        price: ceilingUsd,
        color: '#2f6fed',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'CEILING',
      });
    }

    if (entryUsd && entryUsd > 0) {
      series.createPriceLine({
        price: entryUsd,
        color: '#7cf7d4',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'ENTRY',
      });
    }

    if (ladder) {
      ladder.rungs.forEach((rung, i) => {
        // A market rung sits exactly at spot; drawing it just stacks a second
        // label on top of the current-price label.
        const atSpot = Math.abs(rung.priceUsd - (candles.at(-1)?.close ?? 0)) < 1e-12;
        if (atSpot) return;
        series.createPriceLine({
          price: rung.priceUsd,
          color: 'rgba(0,224,138,0.75)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `R${i + 1}`,
        });
      });
      series.createPriceLine({
        price: ladder.hardStopUsd,
        color: '#ffb020',
        lineWidth: 2,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: true,
        title: 'STOP',
      });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => chart.applyOptions({ width: container.clientWidth });
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [candles, trapdoorUsd, ceilingUsd, ladder, entryUsd, height]);

  if (candles.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-dashed border-border/70 px-6 text-center',
          className,
        )}
        style={{ height }}
      >
        <p className="max-w-xs text-sm text-muted-foreground">
          No candles available for this token. Add a Birdeye key to turn the chart on — the engine
          works without it, but the stop falls back to a default range assumption.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div ref={containerRef} className="w-full" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        {trapdoorUsd !== null && <span className="text-coil">— trapdoor {formatPrice(trapdoorUsd)}</span>}
        {ceilingUsd !== null && <span className="text-trap">-- ceiling {formatPrice(ceilingUsd)}</span>}
        {ladder && <span className="text-warn">== stop {formatPrice(ladder.hardStopUsd)}</span>}
      </div>
    </div>
  );
}

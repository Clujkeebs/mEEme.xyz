import { Badge } from '@/components/ui/badge';
import { VERDICT_META } from '@/lib/engine/verdict';
import type { AlphaSignal } from '@/lib/engine/types';
import { cn, formatPrice } from '@/lib/utils';

/**
 * The hero's right column: a real engine read, above the fold.
 *
 * The landing page previously spent three paragraphs arguing before showing
 * anything, and at desktop widths the entire right half of the hero was empty
 * — which reads as unfinished on a product asking strangers to trust it with
 * exit decisions. This is the same signal the worked example further down
 * uses, compressed to what someone skimming actually needs: the call, how
 * loud the coil is, and the two prices that follow from it.
 *
 * Deliberately not a mockup. If the numbers here were invented, every claim
 * under them would be worth less.
 */
export function HeroReadout({ signal, demo }: { signal: AlphaSignal; demo: boolean }) {
  const meta = VERDICT_META[signal.verdict];
  const { coil, ladder } = signal;

  const tone = {
    apex: 'text-primary',
    good: 'text-primary',
    neutral: 'text-hud',
    warn: 'text-warn',
    danger: 'text-destructive',
  }[meta.tone];

  // The coil bar is the mark, drawn large: supply stacked against the spot
  // line. Widths come from the real report rather than being decorative.
  const coilPct = Math.max(4, Math.min(100, coil.coiledSupply * 100));
  const trappedPct = Math.max(4, Math.min(100, coil.trappedSupply * 100));

  return (
    <div className="hud-panel-hero corner-bracket lift glint overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
        <span className="hud-label caret">live read</span>
        <div className="flex items-center gap-2">
          <Badge variant="muted">${signal.snapshot.symbol}</Badge>
          {demo && <Badge variant="warn">demo</Badge>}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className={cn('font-display text-2xl font-bold tracking-tight', tone)}>{meta.label}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{signal.headline}</p>
        </div>

        {/* Coil vs. trapped, as opposing bars around the spot line. */}
        <div className="space-y-2">
          <Row label="coiled supply" value={`${(coil.coiledSupply * 100).toFixed(0)}%`} tone="danger">
            <div className="grow-bar h-1.5 rounded-full bg-destructive/70" style={{ width: `${coilPct}%` }} />
          </Row>
          <div className="h-px bg-primary/60" aria-hidden="true" />
          <Row label="trapped supply" value={`${(coil.trappedSupply * 100).toFixed(0)}%`} tone="muted">
            <div className="grow-bar h-1.5 rounded-full bg-primary/50" style={{ width: `${trappedPct}%` }} />
          </Row>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-[12px]">
          <Stat label="coil score" value={coil.coilScore.toFixed(2)} />
          <Stat label="confidence" value={`${(coil.confidence * 100).toFixed(0)}%`} />
          {ladder && (
            <>
              <Stat label="first exit" value={ladder.rungs[0] ? formatPrice(ladder.rungs[0].priceUsd) : '—'} />
              <Stat label="hard stop" value={formatPrice(ladder.hardStopUsd)} tone="text-destructive" />
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone: 'danger' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="hud-label">{label}</span>
        <span
          className={cn(
            'tnum font-mono text-[11px] font-semibold',
            tone === 'danger' ? 'text-destructive' : 'text-primary',
          )}
        >
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/70">{children}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="hud-label">{label}</dt>
      <dd className={cn('tnum font-mono font-semibold', tone ?? 'text-foreground')}>{value}</dd>
    </div>
  );
}

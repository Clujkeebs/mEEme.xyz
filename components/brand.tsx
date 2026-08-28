import { cn } from '@/lib/utils';

/**
 * The mark.
 *
 * Not a decorative glyph — it is the product's own core visual, abstracted: a
 * price axis, two blocks of held supply at different cost bases, and the spot
 * line cutting across. Everything above the line still has to sell into your
 * exit; everything below is already in profit. That is the thesis of the app
 * in one axis and three strokes.
 *
 * Four deliberate choices, each learned from a version that failed:
 *
 *  - There are two supply bars, not three. Three horizontal bars is a
 *    hamburger icon, and no amount of asymmetry fully escapes that at 30px —
 *    a version of this mark sat beside an actual menu button in the mobile
 *    header and read as a second one. Two bars cannot be misread that way.
 *  - They hang off a vertical price axis. A bar anchored to an axis is a
 *    chart; a bar floating in space is a line of text. The axis is the single
 *    cheapest element that makes the mark read as data.
 *  - The spot line overhangs the axis on the left and the bars on the right,
 *    because a price level crosses the whole chart rather than sitting inside
 *    it. It is the only branded colour, which is what makes it legible at a
 *    glance.
 *  - Four elements, not six. This is the same geometry the favicon and the
 *    home-screen icon draw, so the mark is one shape everywhere rather than
 *    three drawings that drift apart.
 *
 * Bars inherit `currentColor` so the mark survives monochrome contexts; only
 * the spot line is branded.
 */
export function MeemeMark({
  className,
  title,
}: {
  className?: string;
  /** Provide only when the mark stands alone; inside a labelled link it should stay decorative. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-8 w-8', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* The tile. Gives the mark an edge so it reads as a logo, not an icon. */}
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="8"
        className="fill-primary/[0.07] stroke-primary/30"
        strokeWidth="1.5"
      />

      {/* The price axis the supply hangs off. */}
      <rect x="6.6" y="5.6" width="2.2" height="20.8" rx="1.1" fill="currentColor" opacity="0.42" />

      {/* Supply above spot — the coil, still holding, still able to sell into you. */}
      <rect x="9.8" y="7.4" width="15.4" height="4.2" rx="2.1" fill="currentColor" opacity="0.9" />

      {/* Spot. Crosses the axis and overhangs the bars — the level everything is measured against. */}
      <rect x="2.4" y="13.9" width="26.4" height="4.2" rx="2.1" className="fill-primary" />

      {/* Supply below spot — already in profit, the trapdoor side. */}
      <rect x="9.8" y="20.4" width="8.2" height="4.2" rx="2.1" fill="currentColor" opacity="0.5" />

    </svg>
  );
}

/** Mark + wordmark lockup. `href`-less so callers decide whether it links. */
export function MeemeLogo({
  className,
  markClassName,
  showTagline = false,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <MeemeMark className={cn('h-[30px] w-[30px] text-foreground', markClassName)} />
      <span className="flex items-baseline gap-2.5">
        <span aria-hidden="true" className="text-[19px] font-extrabold tracking-tight">
          m<span className="text-primary text-glow">EE</span>me
          <span className="text-muted-foreground/70">.xyz</span>
        </span>
        {showTagline && (
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.22em] text-primary/60 sm:inline">
            exit engine
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Concept glyphs.
 *
 * The three ideas the product rests on — coiled supply, trapped supply,
 * insider coil — were previously illustrated with stock icons: a downward
 * trend line, a shield, a radar dish. None of them meant anything. A shield
 * next to "trapped supply" actively misleads, since trapped supply is not
 * protection, it is other people's losses working in your favour.
 *
 * These draw the actual thing instead, in the same language as the mark: a
 * spot line with supply stacked on one side of it. Someone who reads the three
 * glyphs left to right has already been told the mechanic before reading a
 * word of the copy — and the page stops looking like every other dark landing
 * page assembled out of the same icon set.
 */

/** Shared geometry so the three glyphs read as one family. */
const GLYPH_BARS_BELOW = [
  { y: 21.5, w: 30 },
  { y: 26.5, w: 21 },
  { y: 31.5, w: 13 },
];
const GLYPH_BARS_ABOVE = [
  { y: 2.5, w: 13 },
  { y: 7.5, w: 21 },
  { y: 12.5, w: 30 },
];

function GlyphFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 36" fill="none" className="h-11 w-[72px]" aria-hidden="true">
      {/* Spot. The line every one of these is measured against. */}
      <rect x="1" y="17.2" width="62" height="1.6" rx="0.8" className="fill-muted-foreground/45" />
      {children}
    </svg>
  );
}

/** Supply cheaper than you: in profit, below the line, able to sell into your exit. */
export function CoiledGlyph() {
  return (
    <GlyphFrame>
      {GLYPH_BARS_BELOW.map((b) => (
        <rect key={b.y} x="6" y={b.y} width={b.w} height="3.2" rx="1.6" fill="#ff4a3d" opacity="0.85" />
      ))}
    </GlyphFrame>
  );
}

/** Supply more expensive than you: underwater, above the line, structurally unwilling to sell. */
export function TrappedGlyph() {
  return (
    <GlyphFrame>
      {GLYPH_BARS_ABOVE.map((b) => (
        <rect key={b.y} x="6" y={b.y} width={b.w} height="3.2" rx="1.6" fill="#4d8bff" opacity="0.8" />
      ))}
    </GlyphFrame>
  );
}

/**
 * The same profile, with the share held by deployer-linked wallets drawn as a
 * solid core inside each bar — which is exactly how the app draws it on the
 * real supply profile.
 */
export function InsiderGlyph() {
  return (
    <GlyphFrame>
      {GLYPH_BARS_BELOW.map((b) => (
        <g key={b.y}>
          <rect x="6" y={b.y} width={b.w} height="3.2" rx="1.6" fill="#ffb020" opacity="0.3" />
          <rect x="6" y={b.y} width={Math.max(5, b.w * 0.45)} height="3.2" rx="1.6" fill="#ffb020" />
        </g>
      ))}
    </GlyphFrame>
  );
}

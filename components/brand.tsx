import { cn } from '@/lib/utils';

/**
 * The mark.
 *
 * Not a decorative glyph — it is the product's own core visual, abstracted: a
 * supply profile (bars of held supply at each price level) with the spot line
 * cutting through it. Everything above the line still has to sell into your
 * exit; everything below is already in profit. That is the thesis of the app
 * in four bars and a line.
 *
 * Two deliberate choices, both learned from the first attempt:
 *
 *  - It sits in a bordered tile. Loose bars next to a wordmark read as a
 *    hamburger icon at header size; a contained tile reads as a logo.
 *  - The bar widths alternate rather than taper evenly, and the spot line
 *    over-hangs the bars on both sides. Even, tapering bars also read as a
 *    "sort" or "menu" glyph — the asymmetry is what makes it a distribution.
 *
 * Bars inherit `currentColor` so the mark survives monochrome contexts; only
 * the spot line is branded, which is what makes it legible at a glance.
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

      {/* Supply above spot — the coil, still holding, still able to sell into you. */}
      <rect x="7" y="7.5" width="12" height="3" rx="1.5" fill="currentColor" opacity="0.42" />
      <rect x="7" y="12.5" width="18" height="3" rx="1.5" fill="currentColor" opacity="0.72" />

      {/* Spot. Overhangs the bars on both sides — the line everything is measured against. */}
      <rect x="4" y="17.6" width="24" height="2.4" rx="1.2" className="fill-primary" />

      {/* Supply below spot — already in profit, the trapdoor side. */}
      <rect x="7" y="22.1" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.72" />
      <rect x="7" y="27" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.42" />
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

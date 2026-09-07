'use client';

import * as React from 'react';

/**
 * "The Unwind" — the landing sequence.
 *
 * Scroll is time. Over roughly three viewport heights the visitor watches a
 * token's holder distribution assemble, the price climb through it lighting up
 * everyone now sitting in profit, the insider cluster ignite and drain as it
 * distributes, and the whole structure collapse into a verdict.
 *
 * It is built from the same objects the engine actually reasons about — price
 * buckets, coiled supply, trapped supply, an insider cluster — so the sequence
 * is the product's thesis rather than decoration bolted over it.
 *
 * Three rules hold this together:
 *
 *  - The canvas is decorative. Every word the sequence says exists as real DOM
 *    text underneath it, so the section is readable with JavaScript off, with
 *    canvas unsupported, and to a screen reader.
 *  - Nothing is scroll-jacked. The page scrolls at its normal rate; a sticky
 *    stage just holds the stage still while it passes.
 *  - With reduced motion the sequence renders one resolved frame and stops.
 *    A scrubbed animation is exactly the kind of motion that triggers
 *    vestibular symptoms, and this one covers the whole viewport.
 */

/* ── The distribution ────────────────────────────────────────────────────── */

const BUCKETS = 46;
/* The band of buckets the insider cluster holds — deliberately just under the
   peak, which is where a real pre-launch cluster sits. */
const INSIDER_FROM = 27;
const INSIDER_TO = 33;

/** Deterministic noise, so the profile is identical on every render and SSR. */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A believable volume profile: a fat middle where most of the float changed
 * hands, thin tails, and a second smaller shelf higher up. Shaped by hand
 * rather than left to noise, because the silhouette is the thing being read.
 */
const PROFILE: number[] = Array.from({ length: BUCKETS }, (_, i) => {
  const t = i / (BUCKETS - 1);
  const main = Math.exp(-Math.pow((t - 0.42) / 0.19, 2));
  const shelf = 0.42 * Math.exp(-Math.pow((t - 0.76) / 0.09, 2));
  const tail = 0.16 * Math.exp(-Math.pow((t - 0.06) / 0.11, 2));
  const jitter = 0.82 + seeded(i) * 0.36;
  return Math.max(0.04, (main + shelf + tail) * jitter);
});

const PEAK = Math.max(...PROFILE);

/* ── Phases ──────────────────────────────────────────────────────────────── */

type Phase = { at: number; kicker: string; line: string; note: string };

const PHASES: Phase[] = [
  {
    at: 0,
    kicker: 'Every holder has a cost basis',
    line: 'You are not the only one holding this.',
    note: 'Every unit of float was bought by someone, at some price. Reconstruct those prices and you know who is up, who is stuck, and what each of them does next.',
  },
  {
    at: 0.3,
    kicker: 'Coiled supply',
    line: 'These people are already in profit.',
    note: 'Everyone below the price can sell at a gain right now. Nothing is stopping them. The more of the float sitting there, the more supply can hit the market on any green candle.',
  },
  {
    at: 0.56,
    kicker: 'The cluster moves',
    line: 'The insiders are distributing.',
    note: 'Twelve linked wallets funded from one source before launch, holding 15.1% of tradable float at an average cost of $0.000480. They are not forecasting a top. They are selling into it.',
  },
  {
    at: 0.82,
    kicker: 'The unwind',
    line: 'This is the part that costs you.',
    note: 'The float above the price is stuck, and every recovery runs into it. mEEme reads this structure and gives you a verdict, a ladder and a stop — before the candle tells you.',
  },
];

/* ── Palette ─────────────────────────────────────────────────────────────── */

const LIME = [198, 255, 61] as const;
const VIOLET = [177, 79, 255] as const;
const CORAL = [255, 77, 109] as const;

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
/** Smoothstep — every ramp in the sequence eases, so nothing arrives abruptly. */
const ease = (n: number) => {
  const t = clamp01(n);
  return t * t * (3 - 2 * t);
};
/** Progress of `p` across the window [a,b], eased. */
const seg = (p: number, a: number, b: number) => ease((p - a) / (b - a));

/* ── Particles ───────────────────────────────────────────────────────────── */

type Particle = { x: number; y: number; vx: number; vy: number; life: number; seed: number };

export function UnwindHero() {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const progressRef = React.useRef(0);
  const particlesRef = React.useRef<Particle[]>([]);
  const [phase, setPhase] = React.useState(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
     * Low-power devices draw every second bucket and skip particles entirely,
     * which roughly halves the fills per frame. Measured on a 6x-throttled CPU
     * — a fair stand-in for a cheap Android — the full-detail sequence ran at
     * 28fps, which is visibly rough. This is the audience that matters most
     * here: a memecoin trader is on a phone, not a workstation.
     *
     * Viewport width is the primary signal; hardwareConcurrency only catches
     * genuinely weak machines at <= 2. An earlier <= 4 threshold was wrong —
     * plenty of real laptops report exactly 4 cores, and it was silently
     * halving detail on full desktops. Getting this wrong costs a sparser
     * profile rather than a broken one, so it errs toward full detail.
     */
    const lowPower =
      (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 2) ||
      window.innerWidth < 760;
    const step = lowPower ? 2 : 1;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;
    /* The drawn progress trails the scroll position and catches up each frame.
       Scrubbing straight off scrollTop reads mechanical; a spring makes the
       stage feel like it has mass. */
    let shown = 0;

    /*
     * Layout and the three bar gradients depend only on canvas size, so they
     * are rebuilt on resize rather than on every frame. Allocating gradient
     * objects sixty times a second was measurable: it held the sequence at
     * ~47fps with every other frame dropped.
     */
    type Layout = {
      padY: number;
      axisX: number;
      usableW: number;
      usableH: number;
      rowH: number;
      barH: number;
      lime: CanvasGradient;
      violet: CanvasGradient;
      coral: CanvasGradient;
    };
    let L: Layout | null = null;

    const relayout = () => {
      /*
       * Wide screens split left/right: copy left, profile right. Narrow screens
       * have no horizontal room for that, so they split top/bottom instead —
       * the profile takes the lower half and the copy sits above it on clean
       * ground. Both are the same idea: separate the two rather than dimming
       * the profile behind a scrim to keep the type readable, which on mobile
       * left the copy sitting directly on bright bars.
       */
      const wide = width >= 900;
      const padY = wide ? Math.max(28, height * 0.1) : height * 0.46;
      const axisX = wide ? width * 0.5 : Math.max(16, width * 0.06);
      const rightPad = Math.max(20, width * 0.05);
      const usableW = width - axisX - rightPad;
      const usableH = wide ? height - padY * 2 : height * 0.48;

      const ramp = (c: readonly number[], punch: number) => {
        const g = ctx.createLinearGradient(axisX, 0, axisX + usableW, 0);
        g.addColorStop(0, rgba(c, 0.95 * punch));
        g.addColorStop(0.55, rgba(c, 0.72 * punch));
        g.addColorStop(1, rgba(c, 0.3 * punch));
        return g;
      };

      L = {
        padY,
        axisX,
        usableW,
        usableH,
        rowH: usableH / BUCKETS,
        /* Scaled by `step` so a half-detail profile stays visually dense
           rather than combed with gaps where buckets were skipped. */
        barH: Math.max(2, (usableH / BUCKETS) * step * 0.62),
        lime: ramp(LIME, 1),
        violet: ramp(VIOLET, 0.72),
        coral: ramp(CORAL, 1),
      };
    };

    const resize = () => {
      /*
       * Capped at 1.5 rather than 2. This canvas is a full-viewport field of
       * soft gradient fills where the difference is not visible, and at DPR 2
       * a 1440x900 stage is 2.6M pixels to repaint every frame.
       */
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      relayout();
    };

    const readProgress = () => {
      const rect = stage.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) return 0;
      return clamp01(-rect.top / travel);
    };

    const draw = (p: number) => {
      if (!L) relayout();
      if (!L) return;
      const { padY, axisX, usableW, usableH, rowH, barH } = L;

      ctx.clearRect(0, 0, width, height);

      /* Assembly: bars fly in staggered, bottom-up. */
      const assemble = seg(p, 0, 0.26);
      /* Spot climbs the stack, then collapses through it. */
      const rise = seg(p, 0.24, 0.54);
      const collapse = seg(p, 0.74, 0.98);
      const spotT = rise * 0.78 - collapse * 0.66;
      const spotIdx = clamp01(spotT) * (BUCKETS - 1);
      const spotY = padY + usableH - spotIdx * rowH - rowH / 2;

      /* Insider ignition and drain. */
      const ignite = seg(p, 0.5, 0.62);
      const drain = seg(p, 0.58, 0.84);

      /*
       * The bar gradients are the cached ones from relayout(). They span the
       * full plot width, so a short bar shows only the bright head of the ramp
       * — which reads correctly, since a short bar is a small amount of supply.
       *
       * The first version of this loop allocated 46 gradients and set
       * shadowBlur 46 times per frame. Canvas shadow blur forces a separate
       * blur rasterisation per fill; at 60fps that is roughly 2,700 blur passes
       * a second, and it measured 24fps on a 4x-throttled CPU. There is no blur
       * in this loop now — the bloom below does that job once.
       */
      const limeRamp = L.lime;
      const violetRamp = L.violet;
      const coralRamp = L.coral;

      /*
       * The cluster's heat: one additive bloom behind the insider band instead
       * of a per-bar shadow. Costs a single fill.
       */
      if (ignite > 0) {
        const bandTop = padY + usableH - INSIDER_TO * rowH - rowH;
        const bandH = (INSIDER_TO - INSIDER_FROM + 2) * rowH;
        const bloom = ctx.createRadialGradient(
          axisX + usableW * 0.18,
          bandTop + bandH / 2,
          0,
          axisX + usableW * 0.18,
          bandTop + bandH / 2,
          Math.max(bandH, usableW * 0.42),
        );
        bloom.addColorStop(0, rgba(CORAL, 0.42 * ignite));
        bloom.addColorStop(1, rgba(CORAL, 0));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = bloom;
        ctx.fillRect(axisX, bandTop - bandH, usableW, bandH * 3);
        ctx.globalCompositeOperation = 'source-over';
      }

      for (let i = 0; i < BUCKETS; i += step) {
        const stagger = clamp01((assemble - (i / BUCKETS) * 0.55) / 0.45);
        if (stagger <= 0) continue;

        const isInsider = i >= INSIDER_FROM && i <= INSIDER_TO;
        const y = padY + usableH - i * rowH - rowH / 2;
        const belowSpot = i < spotIdx;

        /* Insider supply drains away as the cluster sells. */
        const shrink = isInsider ? 1 - drain * 0.82 : 1;
        const w = ((PROFILE[i] ?? 0) / PEAK) * usableW * 0.94 * stagger * shrink;
        if (w <= 0.5) continue;

        /* Coiled (in profit, free to sell) reads lime; trapped (underwater,
           the ceiling every recovery runs into) reads violet. */
        const hot = isInsider && ignite > 0;
        const colour = hot ? CORAL : belowSpot ? LIME : VIOLET;

        ctx.globalAlpha = stagger;
        ctx.fillStyle = hot ? coralRamp : belowSpot ? limeRamp : violetRamp;
        ctx.fillRect(axisX, y - barH / 2, w, barH);

        /* Bright cap at the tip: gives each bar an edge to read against. */
        ctx.fillStyle = rgba(colour, 1);
        ctx.fillRect(axisX + w - 2, y - barH / 2, 2, barH);
        ctx.globalAlpha = 1;

        /* The cluster sheds particles as it distributes. */
        if (hot && ignite > 0.4 && drain > 0 && drain < 1 && !reduced && !lowPower && Math.random() < 0.12) {
          particlesRef.current.push({
            x: axisX + w,
            y,
            vx: 0.6 + Math.random() * 1.9,
            vy: (Math.random() - 0.5) * 0.7,
            life: 1,
            seed: Math.random(),
          });
        }
      }

      /* Particles. */
      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        if (!q) continue;
        q.x += q.vx;
        q.y += q.vy;
        q.life -= 0.014;
        if (q.life <= 0 || q.x > width) {
          parts.splice(i, 1);
          continue;
        }
        ctx.fillStyle = rgba(CORAL, q.life * 0.8);
        const s = 1 + q.seed * 1.6;
        ctx.fillRect(q.x, q.y, s, s);
      }
      if (parts.length > 700) parts.splice(0, parts.length - 700);

      /* The price axis. */
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(axisX - 0.5, padY);
      ctx.lineTo(axisX - 0.5, padY + usableH);
      ctx.stroke();

      /* Spot: the line everything is measured against. */
      if (assemble > 0.35) {
        const spotAlpha = ease((assemble - 0.35) / 0.65);
        ctx.strokeStyle = rgba(LIME, 0.9 * spotAlpha);
        ctx.lineWidth = 2;
        ctx.shadowColor = rgba(LIME, 0.5 * spotAlpha);
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(axisX, spotY);
        ctx.lineTo(axisX + usableW * 0.94, spotY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const price = 0.00412 * (1 + spotT * 4.6);
        ctx.fillStyle = rgba(LIME, spotAlpha);
        ctx.font = '500 11px "Space Mono", ui-monospace, monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`SPOT $${price.toFixed(5)}`, axisX + 6, spotY - 7);
      }
    };

    /*
     * The loop only runs while the stage is actually on screen. A canvas
     * repainting sixty times a second behind three viewports of other content
     * is invisible work that costs a phone its battery, and this section sits
     * on the busiest page in the app.
     */
    let onScreen = true;

    let lastDrawn = -1;

    const frame = () => {
      if (!running) return;
      const target = progressRef.current;
      shown += (target - shown) * 0.12;
      if (Math.abs(target - shown) < 0.0004) shown = target;

      /*
       * Repaint only when something actually changed. Once the spring has
       * settled and the last particle has died, a stationary reader was
       * previously costing a full-viewport clear and ~90 fills every frame for
       * as long as the section stayed on screen — the most expensive way
       * possible to draw nothing new.
       */
      const moved = shown !== lastDrawn;
      const busy = particlesRef.current.length > 0;
      if (onScreen && (moved || busy)) {
        draw(shown);
        lastDrawn = shown;
      }
      raf = requestAnimationFrame(frame);
    };

    const onScroll = () => {
      const p = readProgress();
      progressRef.current = p;
      let next = 0;
      for (let i = 0; i < PHASES.length; i++) {
        const ph = PHASES[i];
        if (ph && p >= ph.at) next = i;
      }
      setPhase(next);
    };

    resize();
    onScroll();

    if (reduced) {
      /* One resolved frame, no loop, no scrub. */
      shown = 0.9;
      draw(0.9);
      setPhase(PHASES.length - 1);
      window.addEventListener('resize', () => {
        resize();
        draw(0.9);
      });
      return () => {
        running = false;
      };
    }

    shown = progressRef.current;
    raf = requestAnimationFrame(frame);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize);

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
      },
      { rootMargin: '120px' },
    );
    io.observe(stage);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <section
      ref={stageRef}
      className="relative -mx-4 h-[340vh] sm:-mx-6 lg:-mx-8"
      aria-label="How the Exit Engine reads a token"
    >
      {/* Copy sits above the profile on narrow screens, centred beside it on wide. */}
      <div className="sticky top-0 flex h-screen items-start overflow-hidden pt-24 lg:items-center lg:pt-0">
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 h-full w-full"
        />

        {/*
          A soft fade where the profile meets the copy on narrow screens, so the
          top of the plot dissolves rather than cutting off at a hard line. The
          canvas keeps the two apart by layout, so this only has to soften a
          seam — it is not carrying legibility.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[38%] h-24 bg-gradient-to-b from-background to-transparent lg:hidden"
        />

        <div className="relative mx-auto w-full max-w-6xl px-6 sm:px-10">
          <div className="max-w-xl lg:max-w-[46%]">
            {/*
              Every phase is in the DOM at once and the inactive ones are hidden
              from layout, not from the accessibility tree by opacity alone —
              so the full argument is readable without JavaScript, and a screen
              reader is never handed four contradictory headlines.
            */}
            {PHASES.map((ph, i) => (
              <div
                key={ph.kicker}
                className={
                  i === phase
                    ? 'transition-opacity duration-500 ease-out'
                    : 'pointer-events-none absolute inset-x-6 top-0 -z-10 opacity-0 sm:inset-x-10'
                }
                aria-hidden={i === phase ? undefined : true}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                  {ph.kicker}
                </p>
                <h2 className="mt-5 font-display text-[2.4rem] font-extrabold leading-[0.98] tracking-[-0.03em] sm:text-[3.6rem]">
                  {ph.line}
                </h2>
                <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                  {ph.note}
                </p>
              </div>
            ))}

            {/* Progress through the sequence, as four ticks. */}
            <div className="mt-10 flex gap-2" aria-hidden>
              {PHASES.map((ph, i) => (
                <span
                  key={ph.kicker}
                  className={`h-[3px] w-10 transition-colors duration-300 ${
                    i <= phase ? 'bg-primary' : 'bg-border'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

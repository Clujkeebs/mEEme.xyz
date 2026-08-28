'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-reveal and count-up.
 *
 * Both are deliberately inert unless the page opted into motion. The root
 * layout sets `data-motion="on"` on <html> before first paint, and only when
 * the visitor has not asked for reduced motion; the CSS that hides a pending
 * reveal is scoped under that attribute. So the failure modes all land on the
 * safe side: no JavaScript, an old browser, reduced motion, or an observer
 * that never fires all leave the content plainly visible.
 */

function motionEnabled(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-motion') === 'on';
}

/**
 * Reveals its children when they scroll into view.
 *
 * `delay` staggers siblings. Keep the values small — 60–90ms between items
 * reads as one movement arriving; 300ms reads as a queue, and a visitor who
 * scrolls fast ends up waiting for the page to catch up with them.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Nothing was hidden, so there is nothing to reveal.
    if (!motionEnabled() || typeof IntersectionObserver === 'undefined') {
      node.setAttribute('data-reveal', 'shown');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-reveal', 'shown');
          // One-shot. Re-hiding on scroll-up makes a page feel unstable and
          // punishes anyone reading back over something.
          observer.unobserve(entry.target);
        }
      },
      // Fire slightly before the element reaches the viewport edge, so the
      // movement is finishing as it arrives rather than starting.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-reveal="pending"
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * Counts a number up when it first comes into view.
 *
 * The final value is rendered server-side and on the first client paint, so
 * the honest number is in the markup for anyone who never sees the animation —
 * a crawler, a reader with reduced motion, a screen reader. The count is
 * `aria-hidden` mid-flight for the same reason: a live region ticking through
 * forty intermediate values is noise, not information.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  durationMs = 1100,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = React.useState(value);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!motionEnabled() || typeof IntersectionObserver === 'undefined') {
      setShown(value);
      return;
    }

    let frame = 0;
    let cancelled = false;

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / durationMs);
        // Same settle curve as the CSS, so a number and the panel around it
        // come to rest together.
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(value * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
        else setShown(value);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          setShown(0);
          run();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={cn('tnum-lock', className)}>
      {/* The true value, always in the accessibility tree and in the HTML. */}
      <span className="sr-only">
        {prefix}
        {value.toFixed(decimals)}
        {suffix}
      </span>
      <span aria-hidden="true">
        {prefix}
        {shown.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}

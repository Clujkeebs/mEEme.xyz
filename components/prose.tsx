import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Typography primitives for long-form posts.
 *
 * Deliberately not a `.prose` blanket class: these carry the same heading
 * scale and rhythm as the rest of the site, and having them as components
 * means a post cannot accidentally skip a heading level — H2 and H3 are the
 * only options, so the document outline stays valid for both screen readers
 * and the crawlers that use it to understand structure.
 */

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[16px] leading-[1.75] text-muted-foreground">{children}</p>;
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 pt-4 font-display text-2xl font-bold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-24 pt-2 font-display text-lg font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  );
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-[16px] leading-[1.7] text-muted-foreground marker:text-primary/60">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function OL({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-[16px] leading-[1.7] text-muted-foreground marker:font-mono marker:text-primary/70">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}

/** The one claim per section a reader should leave with. */
export function Key({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-primary/60 bg-primary/[0.04] py-3 pl-4 pr-3 text-[16px] leading-[1.7] text-foreground/90">
      {children}
    </p>
  );
}

export function Aside({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-lg border border-border/70 bg-card/40 px-4 py-3 text-[15px] leading-[1.65] text-muted-foreground">
      {children}
    </aside>
  );
}

/** Internal link. Internal linking is how crawlers find the money pages. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http');
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-4 hover:brightness-110"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className="text-primary underline underline-offset-4 hover:brightness-110">
      {children}
    </Link>
  );
}

/** Closing call to action. Every post should route somewhere useful. */
export function CTA({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <div className="hud-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px] leading-relaxed text-foreground/85">{children}</p>
      <Link
        href={href}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
      >
        {label}
      </Link>
    </div>
  );
}

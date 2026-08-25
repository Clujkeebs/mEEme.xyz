import type { ReactNode } from 'react';

/**
 * Shared furniture for the legal pages.
 *
 * These pages are the one place in the app where the reader is trying to find
 * a specific clause rather than absorb a pitch, so they get plain prose, real
 * heading levels (h1 → h2 → h3, never skipped), and a visible "last updated"
 * date — the thing people actually check when deciding whether a policy is
 * current.
 */

/** Bump when the substance of any policy changes, not for typo fixes. */
export const LEGAL_LAST_UPDATED = '25 August 2026';

export function LegalShell({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl py-8">
      <header className="mb-10 border-b border-border/60 pb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{summary}</p>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Last updated {LEGAL_LAST_UPDATED}
        </p>
      </header>
      <div className="space-y-8">{children}</div>
    </article>
  );
}

export function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-primary/60">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** For the one or two clauses a reader genuinely must not skim past. */
export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-3 text-[15px] leading-relaxed text-foreground/90">
      {children}
    </div>
  );
}

/**
 * A single place to change the contact address. Every policy has to name a
 * way to reach a human — a policy with no contact route is not a policy, it
 * is a wall.
 *
 * Both point at the same inbox today. The two names are kept apart anyway
 * because they carry different obligations: PRIVACY_EMAIL is the address a
 * data-protection request has to reach within 30 days, and if that ever moves
 * to a dedicated mailbox it should move without touching four policy pages.
 */
export const CONTACT_EMAIL = 'clujkeebs@aol.com';
export const PRIVACY_EMAIL = CONTACT_EMAIL;

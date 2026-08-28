import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/lib/blog';
import { breadcrumbSchema, canonicalMetadata, jsonLdGraph } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Field notes',
  description:
    'How to read a memecoin’s supply structure, why the standard exit ladder is arbitrary, and how every call mEEme makes is graded in public.',
  ...canonicalMetadata('/blog'),
};

export const revalidate = 86400;

export default function BlogIndex() {
  return (
    <div className="py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdGraph(
            breadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Field notes', path: '/blog' },
            ]),
          ),
        }}
      />

      <header className="max-w-3xl">
        <p className="eyebrow text-primary/70">
          field notes
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          How the exit actually works.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
          Written from what the engine does, not from a content calendar. Where the numbers come
          from, where they break, and what the published record can and cannot tell you.
        </p>
      </header>

      <ul className="mt-12 grid gap-4">
        {POSTS.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/blog/${p.slug}`}
              className="hud-panel lift glint group block p-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
                  {p.tag}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {new Date(p.published).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  · {p.minutes} min
                </span>
              </div>
              <h2 className="mt-3 font-display text-xl font-bold tracking-tight transition-colors group-hover:text-primary sm:text-2xl">
                {p.title}
              </h2>
              <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
                {p.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShareOnX } from '@/components/share-on-x';
import { POSTS, allSlugs, getPost } from '@/lib/blog';
import { articleSchema, breadcrumbSchema, canonical, canonicalMetadata, jsonLdGraph } from '@/lib/seo';

export const revalidate = 86400;

// Prerendered at build: a post is static content, and a crawler reaching a
// cached HTML file rather than a render is the accessibility signal that
// research consistently finds matters more than most on-page tweaking.
export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getPost(params.slug);
  if (!post) return { title: 'Not found', robots: { index: false, follow: true } };
  return {
    title: post.title,
    description: post.description,
    ...canonicalMetadata(`/blog/${post.slug}`),
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.published,
      modifiedTime: post.updated ?? post.published,
      url: canonical(`/blog/${post.slug}`),
    },
    twitter: { card: 'summary_large_image', title: post.title, description: post.description },
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  // Two others, so a reader who finishes has somewhere to go and every post
  // links to every other — an orphaned page is one a crawler reaches last.
  const more = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);
  const Body = post.body;

  return (
    <article className="py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdGraph(
            articleSchema({
              title: post.title,
              description: post.description,
              slug: post.slug,
              publishedIso: new Date(post.published).toISOString(),
              updatedIso: post.updated ? new Date(post.updated).toISOString() : undefined,
            }),
            breadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Field notes', path: '/blog' },
              { name: post.title, path: `/blog/${post.slug}` },
            ]),
          ),
        }}
      />

      <div className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link
            href="/blog"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
          >
            ← field notes
          </Link>
        </nav>

        <header className="border-b border-border/60 pb-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
              {post.tag}
            </span>
            <time
              dateTime={post.published}
              className="font-mono text-[10px] text-muted-foreground/70"
            >
              {new Date(post.published).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {post.minutes} min read
            </span>
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold leading-[1.12] tracking-tight sm:text-[2.6rem]">
            {post.title}
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{post.description}</p>
        </header>

        <div className="mt-10 space-y-6">
          <Body />
        </div>

        <footer className="mt-14 border-t border-border/60 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">
              Found this useful? It helps someone holding a bag right now.
            </p>
            <ShareOnX
              text={`${post.title} — via mEEme.xyz`}
              url={canonical(`/blog/${post.slug}`)}
            />
          </div>

          {more.length > 0 && (
            <div className="mt-10">
              <h2 className="hud-label mb-4">keep reading</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {more.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/blog/${p.slug}`}
                      className="hud-panel group block h-full p-4 transition-colors hover:border-primary/40"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/70">
                        {p.tag}
                      </span>
                      <span className="mt-2 block font-display text-[15px] font-semibold leading-snug transition-colors group-hover:text-primary">
                        {p.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </footer>
      </div>
    </article>
  );
}

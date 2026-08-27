import { appUrl } from '@/lib/stripe';

/**
 * SEO helpers.
 *
 * Two things drive everything here.
 *
 * First, the site is reachable on more than one hostname — the Railway
 * subdomain and the custom domain — and without a canonical every page exists
 * twice as far as a crawler is concerned, splitting whatever ranking signal it
 * earns across two URLs. `canonical()` is the single answer to "which URL is
 * the real one".
 *
 * Second, structured data. Not for FAQ rich results — Google stopped showing
 * those in May 2026 outside government and health sites — but because JSON-LD
 * is how a crawler or a language model resolves what this site *is* and which
 * entities it describes, and entity clarity is what gets a page cited rather
 * than paraphrased.
 */

/** Absolute canonical URL for a path. Always the configured public origin. */
export function canonical(path = '/'): string {
  const base = appUrl();
  if (path === '/' || path === '') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Metadata fragment declaring the canonical. Spread into any page's metadata. */
export function canonicalMetadata(path: string) {
  return { alternates: { canonical: canonical(path) } };
}

export const SITE_NAME = 'mEEme.xyz';

/**
 * The X account behind the site.
 *
 * This was previously env-only and unset, so the site shipped with no
 * twitter:creator, no sameAs, and nowhere for a reader who liked it to follow
 * the person who built it — the whole social loop was dark. The reason it was
 * env-only was to avoid *guessing* a handle and attributing the site to a
 * stranger; that reason is gone now the owner has named it, so it lives in
 * code with the env var kept as an override.
 */
export const X_HANDLE = process.env.NEXT_PUBLIC_X_HANDLE?.trim() || 'clujkeebs';

/** Bare handle, no leading @ — for building URLs. */
export const X_HANDLE_BARE = X_HANDLE.replace(/^@/, '');

/** Profile URL for the account behind the site. */
export const X_PROFILE_URL = `https://x.com/${X_HANDLE_BARE}`;

/** twitter:site / twitter:creator, only when a handle is actually configured. */
export function twitterAccountMetadata() {
  if (!X_HANDLE) return {};
  const handle = X_HANDLE.startsWith('@') ? X_HANDLE : `@${X_HANDLE}`;
  return { twitter: { site: handle, creator: handle } };
}

// ── JSON-LD builders ────────────────────────────────────────────────────────
// Plain objects rather than a schema library: the shapes are small, stable, and
// a dependency here would be more code than it saves.

type Json = Record<string, unknown>;

export function organizationSchema(): Json {
  return {
    '@type': 'Organization',
    '@id': `${appUrl()}/#organization`,
    name: SITE_NAME,
    url: canonical('/'),
    logo: `${appUrl()}/apple-icon`,
    description:
      'mEEme.xyz reads how the supply of a Solana memecoin is distributed across cost bases and tells traders when to exit.',
    sameAs: [X_PROFILE_URL],
  };
}

export function websiteSchema(): Json {
  return {
    '@type': 'WebSite',
    '@id': `${appUrl()}/#website`,
    name: SITE_NAME,
    url: canonical('/'),
    publisher: { '@id': `${appUrl()}/#organization` },
    // Declares the in-site entry point for a contract address, which is the
    // only "search" this site actually performs.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${appUrl()}/lock?address={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function softwareApplicationSchema(offers: { name: string; price: number }[]): Json {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${appUrl()}/#app`,
    name: SITE_NAME,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: canonical('/'),
    publisher: { '@id': `${appUrl()}/#organization` },
    description:
      'An exit engine for Solana memecoins. Estimates holder cost basis from the traded volume profile, scores how much supply is coiled below spot, and produces an exit ladder.',
    offers: offers.map((o) => ({
      '@type': 'Offer',
      name: o.name,
      price: o.price.toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: canonical('/pricing'),
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: canonical(t.path),
    })),
  };
}

export function articleSchema(post: {
  title: string;
  description: string;
  slug: string;
  publishedIso: string;
  updatedIso?: string;
}): Json {
  return {
    '@type': 'BlogPosting',
    '@id': `${canonical(`/blog/${post.slug}`)}#article`,
    headline: post.title,
    description: post.description,
    url: canonical(`/blog/${post.slug}`),
    datePublished: post.publishedIso,
    dateModified: post.updatedIso ?? post.publishedIso,
    image: `${appUrl()}/blog/${post.slug}/opengraph-image`,
    author: { '@id': `${appUrl()}/#organization` },
    publisher: { '@id': `${appUrl()}/#organization` },
    isPartOf: { '@id': `${appUrl()}/#website` },
    mainEntityOfPage: canonical(`/blog/${post.slug}`),
  };
}

/**
 * Wraps nodes in a single @graph. One script tag with cross-referenced @ids
 * beats several disconnected ones — it lets a consumer resolve that the
 * article, the site and the organization are the same entities rather than
 * three unrelated blobs.
 */
export function jsonLdGraph(...nodes: Json[]): string {
  const graph = { '@context': 'https://schema.org', '@graph': nodes };
  // `<` is escaped so a value containing "</script>" cannot close the tag it
  // is embedded in. JSON-LD is data, but it is data rendered inside HTML.
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

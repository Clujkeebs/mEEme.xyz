import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { appUrl } from '@/lib/stripe';

// Rebuilt hourly rather than per-request: the signal list only grows when the
// cron jobs run, and a crawler hitting a database query on every fetch is the
// kind of thing that quietly becomes a load problem.
export const revalidate = 3600;

/** Public share cards to include. Bounded — a sitemap is capped at 50k URLs. */
const MAX_SIGNALS = 2000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();

  const staticRoutes: MetadataRoute.Sitemap = ([
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/lock`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/track-record`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/cookies`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/risk`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${base}/accessibility`, changeFrequency: 'yearly', priority: 0.2 },
  ] as const).map((r) => ({ ...r, lastModified: new Date() }));

  // Every published call is a real, indexable page with a share card — the
  // long tail that makes a token symbol search reach this site at all.
  let signals: MetadataRoute.Sitemap = [];
  try {
    const rows = await prisma.signal.findMany({
      where: { synthetic: false },
      orderBy: { createdAt: 'desc' },
      take: MAX_SIGNALS,
      select: { shareSlug: true, createdAt: true },
    });
    signals = rows.map((r) => ({
      url: `${base}/signal/${r.shareSlug}`,
      lastModified: r.createdAt,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch {
    // A sitemap missing its long tail still beats a 500 that tells crawlers
    // the whole file is broken.
  }

  return [...staticRoutes, ...signals];
}

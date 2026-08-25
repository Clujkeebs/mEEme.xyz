import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/stripe';

/**
 * Signed-in surfaces and the API are disallowed: they need a session to render
 * anything, so a crawler that follows them burns budget to reach a redirect,
 * and any that did render would be one user's private positions.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard', '/signin'],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
    host: appUrl(),
  };
}

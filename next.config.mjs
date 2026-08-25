// Runs before the build and before any module reads the environment. The same
// guard runs at runtime via instrumentation.ts — see lib/env-guard.ts for why
// this cannot simply be handled where the value is used.
{
  const raw = process.env.NEXTAUTH_URL;
  if (raw !== undefined) {
    const trimmed = raw.trim();
    let normalized;
    if (trimmed) {
      try {
        normalized = new URL(trimmed).toString().replace(/\/+$/, '');
      } catch {
        console.warn(`[env] NEXTAUTH_URL is set but not a valid URL (${JSON.stringify(trimmed)}). Ignoring it.`);
      }
    }
    if (normalized) process.env.NEXTAUTH_URL = normalized;
    else delete process.env.NEXTAUTH_URL;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { instrumentationHook: true },
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Once a browser has seen this it refuses to talk to the site over
          // plain HTTP at all, which closes the downgrade window on a site that
          // carries session cookies and hands people off to a card form. Two
          // years with subdomains, which is what the HSTS preload list requires
          // if we ever submit the domain to it.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // The app uses none of these. Denying them means a compromised
          // dependency cannot quietly start asking users for a camera or a
          // location either.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};
export default nextConfig;

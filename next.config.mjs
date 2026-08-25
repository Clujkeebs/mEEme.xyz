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
        ],
      },
    ];
  },
};
export default nextConfig;

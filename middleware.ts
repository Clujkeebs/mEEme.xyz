import { NextResponse, type NextRequest } from 'next/server';

/**
 * meeme.xyz is the domain we sell — a visitor should never be looking at the
 * Railway URL underneath it. This forces that even for someone who has the
 * railway.app link bookmarked or indexed from before the custom domain went
 * live. API routes are excluded (see matcher below): webhook senders (Stripe,
 * Telegram) generally do not follow redirects, so redirecting them would
 * silently break delivery instead of just looking untidy.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (host.endsWith('.up.railway.app')) {
    const canonical = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://meeme.xyz');
    return NextResponse.redirect(canonical, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import * as React from 'react';
import { MeemeLogo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/lock', label: 'Target Lock' },
  { href: '/dashboard', label: 'Watchtower' },
  { href: '/track-record', label: 'Track Record' },
  { href: '/blog', label: 'Field Notes' },
  { href: '/pricing', label: 'Pricing' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  // Below sm, five nav items don't fit next to the logo and the auth
  // controls — a horizontally-scrolling nav row used to sit there instead,
  // which just meant "Watchtower" was permanently clipped mid-word behind
  // the Sign in button with no hint that it scrolled. A menu that actually
  // fits the items is the fix, not a wider scroll track.
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      {/*
        The spot line, run along the bottom edge of the header. The mark's
        accent bar overhangs its supply bars; repeating that one gesture as the
        page's top rule is what ties the chrome to the logo instead of leaving
        the header a plain bordered strip.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.55) 18%, hsl(var(--primary) / 0.15) 46%, transparent 72%)',
        }}
      />
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="group shrink-0 transition-opacity hover:opacity-90"
          aria-label="mEEme.xyz home"
        >
          <MeemeLogo showTagline />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 sm:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap rounded px-2.5 py-1.5 text-sm transition-colors',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
          {status === 'authenticated' && session?.user ? (
            <>
              {session.user.isAdmin && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/users">Admin</Link>
                </Button>
              )}
              {session.user.isAffiliate && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/affiliate">Affiliate</Link>
                </Button>
              )}
              <Badge variant={session.user.tier === 'FREE' ? 'muted' : 'default'}>
                {session.user.tier}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : status === 'loading' ? (
            <div className="shimmer h-8 w-20 rounded" aria-hidden="true" />
          ) : (
            <Button size="sm" asChild>
              <Link href="/signin">Sign in</Link>
            </Button>
          )}
        </div>

        {/*
          Labelled, not a hamburger.

          The logo is a supply profile — stacked horizontal bars — and at 30px
          beside a three-line hamburger icon the two read as the same object,
          so the header looked like it had two menu buttons and no brand. The
          fix is on this side rather than the logo's: the mark is the product's
          own core visual and earns its place, while the menu affordance is
          generic and can be anything unambiguous. A bordered mono label says
          exactly what it is, is a larger tap target than a 20px glyph, and
          belongs to the terminal typography the rest of the app is built from.
        */}
        <button
          type="button"
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] transition-colors sm:hidden',
            menuOpen
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? 'Close' : 'Menu'}
          <span
            aria-hidden="true"
            className={cn(
              'text-[9px] leading-none transition-transform duration-200',
              menuOpen && 'rotate-180',
            )}
          >
            &#9660;
          </span>
        </button>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="enter origin-top border-t border-border/60 bg-background/95 px-4 py-3 sm:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded px-3 py-2.5 text-[15px]',
                      active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
            {status === 'authenticated' && session?.user ? (
              <>
                <Badge variant={session.user.tier === 'FREE' ? 'muted' : 'default'}>
                  {session.user.tier}
                </Badge>
                {session.user.isAdmin && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/users">Admin</Link>
                  </Button>
                )}
                {session.user.isAffiliate && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/affiliate">Affiliate</Link>
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            ) : status === 'loading' ? (
              <div className="shimmer h-8 w-20 rounded" aria-hidden="true" />
            ) : (
              <Button size="sm" className="w-full" asChild>
                <Link href="/signin">Sign in</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Menu, X } from 'lucide-react';
import * as React from 'react';
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
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2.5" aria-label="mEEme.xyz home">
          <span aria-hidden="true" className="text-[19px] font-extrabold tracking-tight">
            m<span className="text-primary text-glow">EE</span>me
            <span className="text-muted-foreground/70">.xyz</span>
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.22em] text-primary/60 sm:inline">
            exit engine
          </span>
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
              <Badge variant={session.user.tier === 'FREE' ? 'muted' : 'default'}>
                {session.user.tier}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : status === 'loading' ? (
            <div className="h-8 w-20 animate-pulse rounded bg-secondary" aria-hidden="true" />
          ) : (
            <Button size="sm" asChild>
              <Link href="/signin">Sign in</Link>
            </Button>
          )}
        </div>

        <button
          type="button"
          className="ml-auto -mr-2 rounded p-2 text-muted-foreground hover:text-foreground sm:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-border/60 bg-background/95 px-4 py-3 sm:hidden"
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
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            ) : status === 'loading' ? (
              <div className="h-8 w-20 animate-pulse rounded bg-secondary" aria-hidden="true" />
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

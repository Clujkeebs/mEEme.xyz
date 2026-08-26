'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
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

        <nav
          aria-label="Main"
          className="no-scrollbar -mx-1 flex flex-1 items-center gap-1 overflow-x-auto"
        >
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
            <Link
              key={item.href}
              href={item.href}
              // Conveys "you are here" to a screen reader, which otherwise gets
              // only the background colour — i.e. nothing.
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

        <div className="flex shrink-0 items-center gap-2">
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
      </div>
    </header>
  );
}

import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Toaster } from 'sonner';
import { CookieConsent } from '@/components/cookie-consent';
import { SiteHeader } from '@/components/site-header';
import { Providers } from '@/components/providers';
import { appOrigin } from '@/lib/stripe';
import './globals.css';

const title = 'mEEme.xyz — the Exit Engine';
const description =
  'Every memecoin tool is built for the entry. Entry is a race you cannot win. mEEme reads who still has to sell, and tells you when to get out.';

export const metadata: Metadata = {
  metadataBase: appOrigin(),
  title: { default: title, template: '%s · mEEme.xyz' },
  description,
  applicationName: 'mEEme.xyz',
  openGraph: { title, description, type: 'website', siteName: 'mEEme.xyz' },
  twitter: { card: 'summary_large_image', title, description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#080b0e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/*
          Loaded at runtime by the browser rather than through next/font, which
          fetches at build time — a build that reaches out to a font CDN is a
          build that can fail for a reason unrelated to the code. Every stack in
          globals.css has a real fallback, so a blocked CDN costs character, not
          layout.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          no-page-custom-font targets the Pages Router, where a <link> in a page
          loads for that page only. This is the App Router root layout, so it
          applies to every route — the rule does not hold here.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen">
        <Providers>
          {/*
            First focusable element on the page. A keyboard or screen-reader
            user would otherwise have to tab through the whole header on every
            navigation to reach the content.
          */}
          <a
            href="#main-content"
            className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
          >
            Skip to main content
          </a>
          <SiteHeader />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8 outline-none sm:px-6 lg:px-8"
          >
            {children}
          </main>
          <SiteFooter />
          <CookieConsent />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'hsl(222 30% 8%)',
                border: '1px solid hsl(220 22% 16%)',
                color: 'hsl(180 12% 92%)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/cookies', label: 'Cookie Policy' },
  { href: '/risk', label: 'Risk Disclosure' },
  { href: '/accessibility', label: 'Accessibility' },
];

const PRODUCT_LINKS = [
  { href: '/lock', label: 'Target Lock' },
  { href: '/dashboard', label: 'Watchtower' },
  { href: '/track-record', label: 'Track Record' },
  { href: '/pricing', label: 'Pricing' },
];

function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[15px] font-extrabold tracking-tight">
              m<span className="text-primary">EE</span>me
              <span className="text-muted-foreground/70">.xyz</span>
            </p>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground/90">Not financial advice.</span> mEEme is
              an analysis tool. It reads on-chain supply structure and tells you what it sees; it does
              not know the future, it cannot execute for you, and it has no idea what you can afford
              to lose. Every call it has ever made is published — wins and losses — on the{' '}
              <Link href="/track-record" className="text-primary underline-offset-4 hover:underline">
                track record
              </Link>
              .
            </p>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Memecoins can go to zero, and most do.{' '}
              <Link href="/risk" className="text-primary underline-offset-4 hover:underline">
                Read the risk disclosure
              </Link>{' '}
              before you trade.
            </p>
          </div>

          <nav aria-label="Product">
            <h2 className="hud-label mb-3">Product</h2>
            <ul className="space-y-2 text-[13px]">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h2 className="hud-label mb-3">Legal</h2>
            <ul className="space-y-2 text-[13px]">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-10 border-t border-border/40 pt-6 text-[12px] text-muted-foreground/60">
          © {new Date().getFullYear()} mEEme.xyz. Trading digital assets carries a high risk of total
          loss.
        </p>
      </div>
    </footer>
  );
}

import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Toaster } from 'sonner';
import { AffiliateCapture } from '@/components/affiliate-capture';
import { MeemeLogo } from '@/components/brand';
import { CookieConsent } from '@/components/cookie-consent';
import { PromoBanner } from '@/components/promo-banner';
import { SiteHeader } from '@/components/site-header';
import { Providers } from '@/components/providers';
import { appOrigin } from '@/lib/stripe';
import {
  canonical,
  jsonLdGraph,
  organizationSchema,
  twitterAccountMetadata,
  websiteSchema,
  X_HANDLE_BARE,
  X_PROFILE_URL,
} from '@/lib/seo';
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
  // Without this the site is indexable on both the Railway subdomain and the
  // custom domain, and every page competes with a duplicate of itself.
  alternates: { canonical: canonical('/') },
  ...twitterAccountMetadata(),
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
        {/*
          Motion gate.

          Everything that animates in is hidden by CSS scoped under
          html[data-motion="on"], and this is the only thing that sets it. So
          the page is fully visible when JavaScript is off, when this script
          fails, and when the visitor has asked for reduced motion — a fade-in
          that never fires can never leave the page blank. It runs before first
          paint, so there is no flash of content that then hides itself.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.setAttribute('data-motion','on')}}catch(e){}",
          }}
        />
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdGraph(organizationSchema(), websiteSchema()),
          }}
        />
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
          <PromoBanner />
          <AffiliateCapture />
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
  { href: '/blog', label: 'Field Notes' },
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
            <MeemeLogo />
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

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border/40 pt-6">
          <p className="text-[12px] text-muted-foreground/60">
            © {new Date().getFullYear()} mEEme.xyz. Trading digital assets carries a high risk of
            total loss.
          </p>
          {/* The site had no outbound link to the person who built it, so a
              reader who liked it had nowhere to go. This is also the sameAs
              target in the Organization JSON-LD, which is what lets a search
              engine connect the site to the account. */}
          <a
            href={X_PROFILE_URL}
            rel="me noopener noreferrer"
            target="_blank"
            className="inline-flex items-center gap-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
              <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64Z" />
            </svg>
            Built by @{X_HANDLE_BARE}
          </a>
        </div>
      </div>
    </footer>
  );
}

import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
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
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">{children}</main>
          <SiteFooter />
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

function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-[13px] text-muted-foreground sm:px-6 lg:px-8">
        <p className="max-w-3xl leading-relaxed">
          <span className="font-semibold text-foreground/90">Not financial advice.</span> mEEme is an
          analysis tool. It reads on-chain supply structure and tells you what it sees; it does not
          know the future, it cannot execute for you, and it has no idea what you can afford to lose.
          Every call it has ever made is published — wins and losses — on the{' '}
          <a href="/track-record" className="text-primary underline-offset-4 hover:underline">
            track record
          </a>
          . Read it before you trust anything here.
        </p>
        <p className="text-muted-foreground/60">© {new Date().getFullYear()} mEEme.xyz</p>
      </div>
    </footer>
  );
}

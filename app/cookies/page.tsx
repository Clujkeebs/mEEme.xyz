import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, LegalShell, PRIVACY_EMAIL, Section } from '@/components/legal';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Every cookie mEEme.xyz sets, what it does, and how long it lasts. There are five, and none of them track you.',
};

export const revalidate = 86400;

/**
 * The table is the point of this page. A cookie policy that describes
 * categories in prose without ever naming a cookie is unauditable — a reader
 * cannot open dev tools and check it. Naming each one means they can.
 */
const COOKIES: { name: string; purpose: string; duration: string; category: string }[] = [
  {
    name: '__Secure-next-auth.session-token',
    purpose:
      'Keeps you signed in. Holds an opaque random token — no personal data — that maps to a session record in our database.',
    duration: '30 days',
    category: 'Strictly necessary',
  },
  {
    name: '__Host-next-auth.csrf-token',
    purpose:
      'Protects the sign-in flow against cross-site request forgery. Without it, another site could attempt actions in your name.',
    duration: 'Session',
    category: 'Strictly necessary',
  },
  {
    name: '__Secure-next-auth.callback-url',
    purpose: 'Remembers which page to return you to after Google sign-in completes.',
    duration: 'Session',
    category: 'Strictly necessary',
  },
  {
    name: 'meeme.cookie-consent',
    purpose:
      'Remembers your response to the cookie notice, so it is not shown to you on every page. Stores only your choice and the version of the notice you saw.',
    duration: '12 months',
    category: 'Strictly necessary',
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalShell
      title="Cookie Policy"
      summary="Which cookies this site sets, what each one is for, and how long it stays. The list below is exhaustive — if you find one in your browser that is not named here, tell us and we will treat it as a bug."
    >
      <Callout>
        <strong className="font-semibold">There are no tracking cookies on this site.</strong> No
        advertising pixels, no analytics, no session recording, no cross-site trackers. Every cookie
        we set is required for sign-in or for remembering your cookie choice — which is why the
        notice offers no &ldquo;reject&rdquo; button for optional cookies: there are none to reject.
        If that ever changes, they will be off by default and the notice will ask first.
      </Callout>

      <Section id="what" heading="What a cookie is">
        <p>
          A cookie is a small text file a site stores in your browser and reads back on your next
          request. Cookies that are essential for a service you asked for — such as staying signed in
          — do not require consent under EU and UK law. Cookies used for analytics, advertising, or
          profiling do, and must be off until you opt in.
        </p>
      </Section>

      <Section id="table" heading="Every cookie we set">
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Cookies set by mEEme.xyz, with purpose, retention period and category
            </caption>
            <thead>
              <tr className="border-b border-border/70 bg-secondary/25">
                <th scope="col" className="px-4 py-2.5 font-semibold text-foreground/90">Name</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-foreground/90">Purpose</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold text-foreground/90">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {COOKIES.map((c) => (
                <tr key={c.name} className="align-top">
                  <th scope="row" className="px-4 py-3 text-left font-mono text-[11px] font-normal text-foreground/85">
                    {c.name}
                    <span className="mt-1 block font-sans text-[10px] uppercase tracking-wider text-primary/70">
                      {c.category}
                    </span>
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">{c.purpose}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {c.duration}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px]">
          On a local development server the <code className="rounded bg-secondary px-1">__Secure-</code>{' '}
          and <code className="rounded bg-secondary px-1">__Host-</code> prefixes are absent, because
          those prefixes require HTTPS. The cookies are otherwise identical.
        </p>
      </Section>

      <Section id="third-party" heading="Third-party cookies">
        <p>
          Signing in redirects you to Google, and paying redirects you to Stripe. Those companies set
          their own cookies on their own domains while you are there, under their own policies. We
          cannot read them, and they are not set by this site. We embed no third-party scripts,
          iframes, or pixels that would set a cookie on our pages.
        </p>
      </Section>

      <Section id="control" heading="Controlling cookies">
        <p>
          Every browser lets you view, block, and delete cookies in its settings. You are free to
          block ours — but blocking the session cookie means sign-in cannot work, so the paid product
          will not function. Blocking the consent cookie simply means the notice reappears.
        </p>
        <p>
          Questions:{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary underline underline-offset-4">
            {PRIVACY_EMAIL}
          </a>
          . See also the{' '}
          <Link href="/privacy" className="text-primary underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

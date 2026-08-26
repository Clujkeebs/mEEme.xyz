import type { Metadata } from 'next';
import Link from 'next/link';
import { Bullets, Callout, CONTACT_EMAIL, LegalShell, Section } from '@/components/legal';
import { TIERS } from '@/lib/tiers';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The agreement between you and mEEme.xyz: what the service does, what it costs, and what it does not promise.',
};

// Static prose. Nothing here reads the request, so there is no reason to
// render it per visitor.
export const revalidate = 86400;

/**
 * Prices come from TIERS rather than being retyped here. A terms page that
 * quotes a price the checkout does not charge is worse than one that quotes
 * no price at all, and hardcoding it is exactly how that happens.
 */
const price = (t: keyof typeof TIERS) => `$${TIERS[t].priceUsd.toFixed(2)}`;

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      summary="These terms govern your use of mEEme.xyz. They are written to be read, not to be survived. By creating an account or using the service you agree to them."
    >
      <Callout>
        <strong className="font-semibold">mEEme is not a financial adviser, broker, or dealer.</strong>{' '}
        Nothing it produces is investment advice, a recommendation, or a solicitation to buy or sell
        anything. It is an analysis tool that reports what it reads on a public blockchain. Every
        trading decision you make is yours alone, and you can lose everything you put in. Read the{' '}
        <Link href="/risk" className="text-primary underline underline-offset-4">
          risk disclosure
        </Link>{' '}
        before you use it.
      </Callout>

      <Section id="service" heading="1. What the service is">
        <p>
          mEEme.xyz (&ldquo;mEEme&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a software tool that
          analyses publicly available blockchain and market data for Solana tokens. It estimates how
          the supply of a token is distributed across cost bases, produces a score and a verdict, and
          can watch tokens or positions you add and notify you when its reading changes.
        </p>
        <p>
          The service reports an <em>opinion produced by a published algorithm</em> from public data.
          It does not have access to your funds, cannot execute trades, does not custody assets, and
          never asks for a private key or seed phrase. Anyone who asks you for those while claiming to
          be mEEme is attempting to steal from you.
        </p>
      </Section>

      <Section id="eligibility" heading="2. Who may use it">
        <p>You may use mEEme only if all of the following are true:</p>
        <Bullets
          items={[
            'You are at least 18 years old and can form a binding contract.',
            'You are not barred from using the service under the laws of your country, and you are not on any applicable sanctions list.',
            'You are responsible for knowing whether trading the assets you analyse is lawful where you live. We do not give you that answer.',
          ]}
        />
        <p>
          We may refuse, suspend, or terminate service to anyone, including for reasons we are not
          obliged to explain — but see section 8 for what happens to money you have already paid.
        </p>
      </Section>

      <Section id="accounts" heading="3. Your account">
        <p>
          Accounts are created through Google sign-in. You are responsible for the security of the
          Google account you sign in with; anyone who controls it controls your mEEme account. You
          must not share your account, resell access to it, or use another person&rsquo;s account.
        </p>
        <p>
          API keys issued on the Apex tier are secrets. They are shown once and stored only as a hash,
          which means we cannot recover one for you — we can only revoke it and issue a new one. Treat
          a leaked key as compromised and revoke it immediately.
        </p>
      </Section>

      <Section id="plans" heading="4. Plans, billing and renewal">
        <p>The service is offered on three tiers:</p>
        <Bullets
          items={[
            <>
              <strong className="text-foreground/90">{TIERS.FREE.name}</strong> — {price('FREE')}. Free
              to use, limited to {TIERS.FREE.dailyLocks} analyses per day.
            </>,
            <>
              <strong className="text-foreground/90">{TIERS.DEGEN.name}</strong> — {price('DEGEN')} per
              month.
            </>,
            <>
              <strong className="text-foreground/90">{TIERS.APEX.name}</strong> — {price('APEX')} per
              month, including API access.
            </>,
          ]}
        />
        <p>
          Paid plans are billed monthly in advance through Stripe, our payment processor. We never see
          or store your full card number. <strong className="text-foreground/90">Subscriptions renew
          automatically</strong> each month at the then-current price until you cancel. You can cancel
          at any time from the Manage billing control in your Watchtower — or, if that is
          unavailable, by emailing us, which we will action on the same terms; cancellation stops the next
          renewal and you keep paid access until the end of the period you have already paid for.
        </p>
        <p>
          If we change a price, we will tell you before it takes effect on your subscription, and you
          will have the opportunity to cancel before being charged the new amount.
        </p>
      </Section>

      <Section id="refunds" heading="5. Refunds">
        <p>
          If the service materially fails to work as described and we cannot fix it for you, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{' '}
          within 14 days of the charge and we will refund that month. We do not refund because an
          analysis did not agree with the market — the tool tells you what it reads, and being wrong
          about a trade is a risk you accept when you use it, not a defect in the software.
        </p>
        <p>
          Where you have a statutory right to a refund or a cooling-off period under your local
          consumer law, that right applies regardless of anything in this section.
        </p>
      </Section>

      <Section id="acceptable-use" heading="6. Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            'Scrape, resell, redistribute, or sublicense the output of the service, except through the API on a tier that includes API access, and within its published limits.',
            'Circumvent rate limits, quotas, or tier restrictions — including by creating multiple accounts to obtain additional free analyses.',
            'Present mEEme output as your own paid financial advice to third parties, or use it to run a signals group without disclosing that a tool produced the calls.',
            'Use the service to manipulate a market, coordinate a pump, or promote a token while concealing that you hold it.',
            'Attack, overload, or attempt to gain unauthorised access to the service or the accounts of other users.',
          ]}
        />
        <p>
          We enforce these. Accounts used for market manipulation are terminated without refund.
        </p>
      </Section>

      <Section id="availability" heading="7. Availability and data accuracy">
        <p>
          mEEme depends on third-party data sources and on public blockchain infrastructure. Those can
          be slow, rate-limited, incomplete, or wrong, and they can go down entirely. When our data is
          thin, the interface says so and lowers its stated confidence rather than hiding it — but
          low-quality data can still produce a confident-looking reading.
        </p>
        <p>
          The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do
          not guarantee uptime, that alerts will be delivered, that they will be delivered in time to
          act on, or that any analysis is accurate or complete. Alerts are a convenience, not a
          safety mechanism, and you must not rely on one arriving.
        </p>
      </Section>

      <Section id="termination" heading="8. Suspension and termination">
        <p>
          You may stop using the service at any time and delete your account, which deletes the data
          described in the{' '}
          <Link href="/privacy" className="text-primary underline underline-offset-4">
            privacy policy
          </Link>
          . We may suspend or terminate an account that breaches these terms. If we terminate your
          account for a reason other than a breach by you, we will refund the unused portion of the
          period you have paid for.
        </p>
      </Section>

      <Section id="liability" heading="9. Limitation of liability">
        <p>
          To the fullest extent the law allows, mEEme is not liable for trading losses, lost profits,
          lost opportunities, or any indirect or consequential damages arising from your use of the
          service — including where an analysis was wrong, an alert was late, an alert never arrived,
          or the service was unavailable when you needed it.
        </p>
        <p>
          Where liability cannot lawfully be excluded, our total liability to you is limited to the
          amount you paid us in the twelve months before the event giving rise to the claim.
        </p>
        <p>
          Nothing in these terms excludes liability for fraud, for death or personal injury caused by
          negligence, or for anything else that cannot lawfully be excluded. Some jurisdictions do not
          allow certain exclusions, in which case those exclusions do not apply to you.
        </p>
      </Section>

      <Section id="ip" heading="10. Intellectual property">
        <p>
          The software, the interface, the scoring methodology, and the mEEme name and marks belong to
          us. Using the service does not transfer any of that to you. The public track record and the
          share cards it generates may be quoted and linked freely — that is what they are for.
        </p>
        <p>
          Data you enter (positions, watched tokens, wallet addresses) remains yours. You grant us only
          the licence needed to operate the service for you: to store it, and to process it to produce
          your analyses and alerts.
        </p>
      </Section>

      <Section id="changes" heading="11. Changes to these terms">
        <p>
          We may update these terms. If a change materially reduces your rights, we will give notice
          in the app or by email before it takes effect, and continuing to use the service after that
          date means you accept the change. The &ldquo;last updated&rdquo; date at the top of this page
          always reflects the current version.
        </p>
      </Section>

      <Section id="contact" heading="12. Contact">
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

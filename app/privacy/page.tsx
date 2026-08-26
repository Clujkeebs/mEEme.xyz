import type { Metadata } from 'next';
import Link from 'next/link';
import { Bullets, Callout, LegalShell, PRIVACY_EMAIL, Section } from '@/components/legal';
import { canonicalMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What mEEme.xyz collects, why, who it goes to, and how to get it deleted.',
  ...canonicalMetadata('/privacy'),
};

export const revalidate = 86400;

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      summary="What we collect, why we collect it, who else sees it, and how to make us delete it. Written against what the code actually does, not against a template."
    >
      <Callout>
        <strong className="font-semibold">We never ask for a private key or seed phrase.</strong> The
        only wallet data we handle is a <em>public</em> address, and only when you paste one in
        yourself. mEEme cannot move your funds and does not have the ability to acquire that power.
      </Callout>

      <Section id="collect" heading="1. What we collect">
        <p className="text-foreground/90">From your account:</p>
        <Bullets
          items={[
            'Your name, email address, profile image and account identifier, received from Google when you sign in. We do not receive your Google password.',
            'A session record, so that staying signed in works. The cookie in your browser holds only an opaque token; the session itself lives in our database.',
            'Your subscription tier, Stripe customer and subscription identifiers, subscription status and renewal date.',
          ]}
        />
        <p className="text-foreground/90">From your use of the product:</p>
        <Bullets
          items={[
            'Token contract addresses you analyse, watch, or track as positions — along with the position details you enter yourself: size, entry price, and any note you add.',
            'Every analysis the engine runs for you, retained as a permanent record. This is what the public track record is built from.',
            'Public wallet addresses you paste into the wallet scanner, and the holdings it reads back.',
            'A count of how many analyses you have run today, to enforce the daily quota on your plan.',
            'If you connect Telegram: your Telegram chat identifier and username, so alerts have somewhere to go.',
            'For Apex API keys: a cryptographic hash of the key, the first characters for display, and when it was last used. The key itself is never stored and cannot be recovered.',
          ]}
        />
        <p className="text-foreground/90">From visitors who are not signed in:</p>
        <Bullets
          items={[
            'A salted, one-way hash of your IP address paired with the current date, and a count of free analyses run. This exists solely to stop one person consuming unlimited free analyses. We do not store the IP address itself, and the hash cannot be reversed back into one.',
          ]}
        />
        <p>
          We do not run advertising networks, third-party analytics, session recording, or
          cross-site tracking, and we do not build advertising profiles.
        </p>
      </Section>

      <Section id="why" heading="2. Why we are allowed to hold it">
        <p>
          Where the UK/EU GDPR applies, our lawful bases are: <em>performance of a contract</em> for
          the data needed to give you the product you signed up for (your account, your positions,
          your analyses, your alerts); <em>legitimate interests</em> for keeping the service secure and
          preventing quota abuse — a purpose we pursue with a one-way hash precisely so it costs you
          as little privacy as possible; and <em>legal obligation</em> for keeping payment and tax
          records. Where we ever rely on consent, we will ask for it plainly and you can withdraw it.
        </p>
      </Section>

      <Section id="sharing" heading="3. Who else sees it">
        <p>
          We do not sell your personal information, and we do not share it for cross-context
          behavioural advertising. We use these processors to run the service:
        </p>
        <Bullets
          items={[
            <><strong className="text-foreground/90">Google</strong> — sign-in. They tell us who you are; we do not tell them what you analyse.</>,
            <><strong className="text-foreground/90">Stripe</strong> — payments and the billing portal. Your card details go to Stripe directly and never touch our servers.</>,
            <><strong className="text-foreground/90">Railway</strong> (hosting) and <strong className="text-foreground/90">Supabase</strong> (database) — where the application runs and where your data is stored.</>,
            <><strong className="text-foreground/90">Resend</strong> — sending alert emails, if you turn email alerts on.</>,
            <><strong className="text-foreground/90">Telegram</strong> — delivering alerts, if you connect it. Telegram then handles that message under its own privacy policy.</>,
          ]}
        />
        <p className="text-foreground/90">Market data providers, and what reaches them:</p>
        <p>
          To analyse a token we query public market and blockchain data sources — DexScreener,
          GeckoTerminal, Birdeye, Helius and RugCheck. This means{' '}
          <strong className="text-foreground/90">
            the token contract address you are analysing is sent to those providers
          </strong>
          , and when you use the wallet scanner,{' '}
          <strong className="text-foreground/90">the public wallet address you paste is sent to Helius</strong>{' '}
          in order to read its holdings and history. Your name, email and account are never sent with
          those requests, but a provider does observe that <em>someone</em> asked about that address.
          If that matters for your threat model, do not paste a wallet you need kept unlinked.
        </p>
        <p>
          We may also disclose information where we are legally required to, or to establish or defend
          legal claims.
        </p>
      </Section>

      <Section id="retention" heading="4. How long we keep it">
        <Bullets
          items={[
            'Account, positions, watches and alert settings: until you delete your account.',
            'Anonymous quota hashes: 30 days, then deleted. They have no value after the day they gate.',
            'Payment records: as long as tax and accounting law requires us to keep them, typically six to seven years, regardless of account deletion.',
            'Analyses recorded in the public track record: retained permanently and in anonymised form — the token, the call, the timestamp and the outcome, with no link to the account that ran it. A track record that could be quietly pruned would be worthless as evidence, which is the entire point of publishing it.',
          ]}
        />
      </Section>

      <Section id="rights" heading="5. Your rights">
        <p>Wherever you live, you can ask us to:</p>
        <Bullets
          items={[
            'Give you a copy of the personal data we hold about you.',
            'Correct anything that is wrong.',
            'Delete your account and the personal data attached to it.',
            'Export your data in a portable format.',
            'Object to or restrict a particular use, including our legitimate-interests processing.',
          ]}
        />
        <p>
          Email{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary underline underline-offset-4">
            {PRIVACY_EMAIL}
          </a>{' '}
          and we will respond within 30 days. We will not charge you for it, and we will not make the
          service worse for you because you asked.
        </p>
        <p>
          If you are in the EEA or UK and think we have handled your data badly, you may complain to
          your national data protection authority. If you are in California, we do not sell or share
          your personal information as those terms are defined by the CCPA/CPRA, and exercising your
          rights will not result in discriminatory treatment.
        </p>
      </Section>

      <Section id="transfers" heading="6. International transfers">
        <p>
          The service is operated from, and your data is stored in, the United States. If you use it
          from the EEA or the UK, your data is transferred there. Where required, our processors rely
          on Standard Contractual Clauses or an equivalent transfer mechanism for those transfers.
        </p>
      </Section>

      <Section id="security" heading="7. Security">
        <p>
          Traffic is encrypted in transit. API keys are stored only as SHA-256 hashes, so a database
          dump does not hand anyone a working key. Anonymous rate-limit records hold a salted hash
          rather than an IP address. Payment card data never reaches our servers at all.
        </p>
        <p>
          No system is perfectly secure, and we will not pretend otherwise. If we discover a breach
          affecting your personal data, we will notify affected users and the relevant regulator as
          the law requires.
        </p>
      </Section>

      <Section id="children" heading="8. Children">
        <p>
          The service is not for anyone under 18. We do not knowingly collect data from children, and
          we will delete any account we find to belong to one.
        </p>
      </Section>

      <Section id="cookies" heading="9. Cookies">
        <p>
          We use a small number of strictly necessary cookies and no tracking cookies. The detail is
          on the{' '}
          <Link href="/cookies" className="text-primary underline underline-offset-4">
            cookie policy
          </Link>{' '}
          page.
        </p>
      </Section>

      <Section id="changes" heading="10. Changes">
        <p>
          If we change how we use your data in a way that materially affects you, we will give notice
          in the app or by email before the change takes effect. The date at the top of this page
          always reflects the current version.
        </p>
      </Section>
    </LegalShell>
  );
}

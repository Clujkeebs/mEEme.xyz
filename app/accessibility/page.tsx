import type { Metadata } from 'next';
import { Bullets, LegalShell, Section, CONTACT_EMAIL } from '@/components/legal';

export const metadata: Metadata = {
  title: 'Accessibility Statement',
  description: 'How accessible mEEme.xyz currently is, what has been done, and what is still known to fall short.',
};

export const revalidate = 86400;

export default function AccessibilityPage() {
  return (
    <LegalShell
      title="Accessibility Statement"
      summary="Our commitment to making mEEme usable by everyone, an honest account of where it currently stands, and the known gaps we have not closed yet."
    >
      <Section id="commitment" heading="Our commitment">
        <p>
          We aim to meet{' '}
          <a
            href="https://www.w3.org/TR/WCAG21/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            WCAG 2.1 Level AA
          </a>
          . This statement describes the current state of the site rather than an aspiration, and it
          names the things that are still wrong. A statement that claims full conformance without a
          formal audit is not worth reading, so this one does not.
        </p>
      </Section>

      <Section id="done" heading="What is in place">
        <Bullets
          items={[
            'A skip link as the first focusable element on every page, so keyboard users can jump past the header straight to the content.',
            'Visible focus indicators on every interactive element, including links inside prose.',
            'Semantic landmarks — header, main, footer, and labelled navigation regions — so screen-reader users can navigate by structure.',
            'The current page is marked with aria-current, not only with a background colour.',
            'Charts, gauges and the supply profile carry text alternatives describing what they depict.',
            'Form fields have associated labels; the expand/collapse control reports its state with aria-expanded.',
            'Motion is reduced to a single near-instant step when your system requests reduced motion. Purely decorative sweeping animations are removed entirely.',
            'Verdicts are never communicated by colour alone — each one carries an explicit text label and a written explanation.',
            'The interface is responsive and works down to small mobile viewports and at increased browser zoom.',
          ]}
        />
      </Section>

      <Section id="gaps" heading="Known gaps">
        <p>
          These are real and we would rather say so than let you discover them mid-task:
        </p>
        <Bullets
          items={[
            'No independent accessibility audit has been carried out. Everything above was verified by the team, which is not the same thing.',
            'The price chart and supply profile convey detail visually that their text alternative only summarises. There is currently no way to read the underlying series point by point with a screen reader.',
            'The interface is dark-mode only. There is no light theme and no dedicated high-contrast mode yet, though the palette was chosen to hold contrast against its background.',
            'Some dense numeric tables scroll horizontally on narrow screens, which can be awkward with a screen magnifier.',
            'The site has not been tested against every combination of screen reader and browser.',
          ]}
        />
      </Section>

      <Section id="feedback" heading="Tell us when it fails you">
        <p>
          If any part of this site blocks you, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{' '}
          with the page, what you were trying to do, and the assistive technology you were using. We
          treat accessibility reports as bugs, not as feature requests, and we will reply within five
          working days.
        </p>
        <p>
          If you need information that is currently only available in an inaccessible form, ask and we
          will get it to you another way.
        </p>
      </Section>
    </LegalShell>
  );
}

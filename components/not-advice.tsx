import Link from 'next/link';

/**
 * The disclaimer, where the call is.
 *
 * The legal pages already say all of this, and saying it there is necessary but
 * weak on its own: what protects you is what the user actually saw at the moment
 * they read "EXIT IMMEDIATELY — sell 51% at $0.0011", and a link in the footer
 * is not that. This sits directly under the verdict and the ladder, on every
 * surface that renders one.
 *
 * It is also the honest thing to put there, and honest expectation-setting is
 * what stops a losing trade turning into a refund request and an angry thread.
 * So it is deliberately not scare-text or a wall of capitals — a banner people
 * learn to skip protects nobody. One sentence about what the tool is, one about
 * what it cannot know, and the links for anyone who wants the full version.
 */
export function NotAdvice({ className }: { className?: string }) {
  return (
    <p
      className={
        'border-l-2 border-l-border/80 pl-4 text-[12.5px] leading-relaxed text-muted-foreground ' +
        (className ?? '')
      }
    >
      <span className="font-semibold text-foreground/85">This is not financial advice.</span> mEEme
      is a published algorithm reading public on-chain data. It is not a broker or an investment
      adviser, it is not registered with any financial regulator, and it knows nothing about you —
      your income, your obligations, or what you can afford to lose. It states its reading in strong
      language because a hedged one is useless at this speed; strong language is not confidence and
      it is not a promise. Every call it has ever made, right and wrong, is on the{' '}
      <Link href="/track-record" className="text-primary underline-offset-4 hover:underline">
        track record
      </Link>
      . Memecoins can go to zero and most do —{' '}
      <Link href="/risk" className="text-primary underline-offset-4 hover:underline">
        read the risks
      </Link>
      .
    </p>
  );
}

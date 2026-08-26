/**
 * Share to X.
 *
 * Deliberately a plain link to X's intent endpoint, not X's embed or share
 * widget. The widget loads a script from platform.twitter.com which sets
 * third-party cookies and tracks the viewer — which would make the cookie
 * policy's claim of "no advertising, no analytics, no cross-site tracking"
 * false, and would require a real consent gate before it could legally load.
 *
 * A link costs nothing, needs no consent, cannot slow the page down, and does
 * the same job. There is no version of this where the widget is worth it.
 */
export function ShareOnX({
  text,
  url,
  label = 'Share on X',
}: {
  text: string;
  url: string;
  label?: string;
}) {
  const href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-transparent px-4 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary"
    >
      {/* Inline mark rather than an icon-font or remote asset — one path, no
          request, and it stays crisp at any size. */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3.5 w-3.5 fill-current"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {label}
    </a>
  );
}

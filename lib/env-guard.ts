/**
 * Environment sanitising, run before anything reads these variables.
 *
 * NextAuth reads NEXTAUTH_URL at module load and calls `new URL()` on it with
 * no guard. Next evaluates `metadataBase` while prerendering, in the same
 * process. So an environment variable that exists but is blank or mistyped —
 * an ordinary deployment mistake, and one Vercel makes easy by creating empty
 * vars — does not degrade a page. It fails the entire build with
 * `TypeError: Invalid URL` and a stack pointing at a webpack chunk.
 *
 * A blank or unparseable value is treated as absent, which is what the author
 * of an empty variable meant anyway.
 */
export function sanitizeEnvironment(): void {
  const raw = process.env.NEXTAUTH_URL;
  if (raw === undefined) return;

  const trimmed = raw.trim();
  if (!trimmed) {
    delete process.env.NEXTAUTH_URL;
    return;
  }

  try {
    // Normalise while we are here: a trailing slash breaks OAuth callback
    // matching in a way that is genuinely hard to debug from the error.
    const url = new URL(trimmed);
    process.env.NEXTAUTH_URL = url.toString().replace(/\/+$/, '');
  } catch {
    console.warn(
      `[env] NEXTAUTH_URL is set but not a valid URL (${JSON.stringify(trimmed)}). ` +
        'Ignoring it — falling back to VERCEL_URL or localhost.',
    );
    delete process.env.NEXTAUTH_URL;
  }
}

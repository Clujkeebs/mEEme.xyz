/**
 * A `?next=` destination is attacker-controllable — it arrives in a URL that
 * anyone can craft and hand to a victim. Feeding it straight to a redirect is
 * an open-redirect: `/signin?next=https://evil.example` would bounce a
 * freshly-authenticated user off-site, which is exactly the moment they are
 * least suspicious about where they land.
 *
 * So only same-origin absolute paths survive: one leading slash, no second
 * slash (`//evil.example` is protocol-relative and leaves the origin), and no
 * backslash (some parsers normalise `\` to `/`).
 */
export function safeNextPath(value: string | string[] | undefined, fallback = '/dashboard'): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('\\')) return fallback;
  return raw;
}

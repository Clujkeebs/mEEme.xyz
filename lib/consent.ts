/**
 * Cookie consent state.
 *
 * The site currently sets no optional cookies at all — no analytics, no ads,
 * no third-party pixels — so nothing here gates anything today. That is
 * exactly why it is written as a category model rather than a boolean: the
 * moment someone adds an analytics script, the correct behaviour (off until
 * the visitor opts in, re-askable, versioned) already exists and cannot be
 * skipped by whoever is in a hurry that day.
 *
 * Deliberately a cookie rather than localStorage: the cookie policy documents
 * it as a cookie by name, and a policy that misdescribes its own storage is
 * the kind of small dishonesty that makes the rest of the page untrustworthy.
 */

export const CONSENT_COOKIE = 'meeme.cookie-consent';

/**
 * Bump when the categories change, so a stored choice made against an older
 * set of cookies stops counting as informed consent and the notice reappears.
 */
export const CONSENT_VERSION = 1;

/** Categories a visitor can be asked about. `necessary` is not one of them. */
export type ConsentCategory = 'analytics';

export interface ConsentState {
  version: number;
  /** ISO timestamp of the decision — regulators ask when consent was given. */
  decidedAt: string;
  granted: ConsentCategory[];
}

/**
 * Optional categories currently in use. Empty: nothing on the site needs
 * consent, so the notice is an informational one with a single acknowledge
 * action rather than a fake accept/reject pair over categories that do not
 * exist. Add a category here and the notice becomes a real choice.
 */
export const OPTIONAL_CATEGORIES: ConsentCategory[] = [];

export function parseConsent(raw: string | undefined | null): ConsentState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const state = parsed as Partial<ConsentState>;
    if (state.version !== CONSENT_VERSION) return null;
    if (typeof state.decidedAt !== 'string') return null;
    const granted = Array.isArray(state.granted)
      ? state.granted.filter((c): c is ConsentCategory => c === 'analytics')
      : [];
    return { version: CONSENT_VERSION, decidedAt: state.decidedAt, granted };
  } catch {
    // A malformed value is treated as no decision, which re-asks. The
    // alternative — assuming consent — is the one outcome that is never safe.
    return null;
  }
}

export function readConsent(): ConsentState | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
}

export function writeConsent(granted: ConsentCategory[]): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    granted,
  };
  if (typeof document !== 'undefined') {
    const value = encodeURIComponent(JSON.stringify(state));
    const maxAge = 60 * 60 * 24 * 365; // 12 months, as the cookie policy states.
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  }
  return state;
}

/** Whether an optional category may run. Always false until explicitly granted. */
export function hasConsent(category: ConsentCategory, state = readConsent()): boolean {
  return state?.granted.includes(category) ?? false;
}

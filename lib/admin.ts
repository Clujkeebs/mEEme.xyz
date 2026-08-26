import type { Viewer } from './auth';

/**
 * Admin gating.
 *
 * An env-var allowlist rather than a database flag: it can be set on Railway
 * without a migration or a manual row edit, which matters for the one admin
 * this app actually has right now — someone bootstrapping the very first
 * promo code needs this to work before there is any other way in.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(viewer: Pick<Viewer, 'email'> | null): boolean {
  if (!viewer?.email) return false;
  const allowed = adminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(viewer.email.toLowerCase());
}

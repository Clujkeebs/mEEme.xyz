/**
 * The password rule, and nothing else.
 *
 * Deliberately its own module with no imports. The reset form is a client
 * component and needs this rule to give an answer without a round trip; when it
 * lived alongside the token helpers in password-reset.ts, importing it dragged
 * `node:crypto` into the browser bundle and the build refused it — correctly,
 * since shipping the token machinery to the client is exactly what should not
 * happen.
 *
 * Sign-up, reset, and the client all read the rule from here so they cannot
 * drift into disagreeing about what a valid password is.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  // bcrypt is deliberately slow; an unbounded input is a cheap way to make the
  // server do a lot of work per request.
  if (password.length > 200) return 'Password must be under 200 characters.';
  return null;
}

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { hashIp, jsonError, jsonOk } from '@/lib/api';
import { databaseConfigured, prisma } from '@/lib/db';
import { hashResetToken, RESET_STATE_MESSAGE, resetTokenState } from '@/lib/password-reset';
import { passwordProblem } from '@/lib/password-rules';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const schema = z.object({
  token: z.string().min(10).max(500),
  password: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return jsonError('Password reset is unavailable — no database is configured.', 503);
  }
  if (!rateLimit(`reset-confirm:${hashIp(request)}`, 10, 60 * 60 * 1000)) {
    return jsonError('Too many attempts. Try again in a bit.', 429);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError('That reset link is not valid. Request a new one.', 400);

  const problem = passwordProblem(parsed.data.password);
  if (problem) return jsonError(problem, 400);

  // Looked up by hash, so the token itself is never compared against anything
  // stored — and an attacker with a database dump has hashes, not links.
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(parsed.data.token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  const state = resetTokenState(row);
  if (state !== 'valid' || !row) {
    return jsonError(RESET_STATE_MESSAGE[state as Exclude<typeof state, 'valid'>], 400);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  /*
   * The password change and the token burn go together. Without the
   * transaction a crash between them either leaves the link live after the
   * password changed, or changes nothing while consuming the user's only way
   * back in.
   *
   * Existing sessions are dropped too. Someone resetting a password is often
   * doing it because they think another person has it, and leaving that
   * person's session logged in makes the reset theatre.
   */
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);

  return jsonOk({});
}

import { z } from 'zod';
import { hashIp, jsonError, jsonOk } from '@/lib/api';
import { databaseConfigured, prisma } from '@/lib/db';
import { emailConfigured, sendEmail } from '@/lib/notify/email';
import {
  generateResetToken,
  hashResetToken,
  RESET_TTL_MS,
} from '@/lib/password-reset';
import { rateLimit } from '@/lib/ratelimit';
import { appUrl } from '@/lib/stripe';

export const runtime = 'nodejs';

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

function renderResetEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Reset your mEEme password',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0b0713;color:#f2edf7">
        <div style="font-size:12px;letter-spacing:3px;color:#c6ff3d;margin-bottom:18px">mEEme · EXIT ENGINE</div>
        <h1 style="font-size:21px;margin:0 0 8px">Reset your password</h1>
        <p style="font-size:15px;line-height:1.55;color:#b4a8c4;margin:0 0 20px">
          Someone asked to reset the password on this account. If that was not you, nothing has
          changed and you can ignore this — the link below is the only thing that can change it, and
          it stops working in an hour.
        </p>
        <a href="${link}" style="display:inline-block;background:#c6ff3d;color:#0b0713;padding:11px 20px;text-decoration:none;font-weight:700">Set a new password</a>
        <p style="font-size:11px;color:#6f6280;margin-top:28px;line-height:1.5">
          This link works once and expires in one hour.
        </p>
      </div>`,
  };
}

export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return jsonError('Password reset is unavailable — no database is configured.', 503);
  }
  if (!emailConfigured()) {
    // Saying so plainly beats accepting the request and sending nothing, which
    // would leave someone waiting on an email that was never going to arrive.
    return jsonError(
      'Password reset is not available on this deployment yet — it needs an email provider. Contact support to get back into your account.',
      503,
    );
  }

  // A reset endpoint is a free email cannon pointed at any address the caller
  // names, so the cap is per-caller and deliberately tight.
  if (!rateLimit(`reset-request:${hashIp(request)}`, 5, 60 * 60 * 1000)) {
    return jsonError('Too many reset requests. Try again in a bit.', 429);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError('Enter a valid email address.', 400);
  const { email } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  /*
   * Everything below returns the same response whether or not the account
   * exists. An endpoint that says "no account with that email" is an oracle for
   * checking which addresses have signed up here — which, for a product about
   * memecoin positions, is not a harmless thing to publish.
   *
   * The same applies to an account that exists but has no password (signed up
   * through a social provider): telling the caller that would leak the same
   * fact one level down.
   */
  if (user?.passwordHash) {
    // One live link at a time. A previously-sent link stops working the moment
    // a new one is requested, so a forwarded or logged link is not a spare key.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const link = `${appUrl()}/signin/reset?token=${encodeURIComponent(token)}`;
    const { subject, html } = renderResetEmail(link);
    // A provider failure must not change the response shape either — that would
    // reintroduce the oracle through a side door.
    await sendEmail(email, subject, html).catch(() => undefined);
  }

  return jsonOk({});
}

import { z } from 'zod';
import { fetchJson, providerConfigured } from '@/lib/providers/http';

/**
 * Email delivery via Resend. The fallback channel: slower than Telegram and
 * more likely to be ignored, but it works for people who will not install a
 * bot, and it is the only channel that survives a Telegram outage.
 */

const KEY = process.env.RESEND_API_KEY ?? '';
export const emailConfigured = (): boolean => providerConfigured(KEY);

const FROM = process.env.ALERT_FROM_EMAIL || 'mEEme <alerts@meeme.xyz>';

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) return { ok: false, error: 'RESEND_API_KEY is not set' };

  const res = await fetchJson({
    provider: 'resend:send',
    url: 'https://api.resend.com/emails',
    schema: z.object({ id: z.string().nullish(), message: z.string().nullish() }),
    timeoutMs: 10_000,
    retries: 1,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    },
  });

  if (!res) return { ok: false, error: 'no response from Resend' };
  if (!res.id) return { ok: false, error: res.message ?? 'Resend rejected the message' };
  return { ok: true };
}

import { cronAuthorized, jsonError, jsonOk } from '@/lib/api';
import { setTelegramWebhook, telegramConfigured } from '@/lib/notify';
import { appUrl } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Register the Telegram webhook. Run once after deploying, and again if the
 * deployment URL changes.
 *
 *   curl -X POST https://your-app/api/telegram/setup -H "authorization: Bearer $CRON_SECRET"
 *
 * Guarded by CRON_SECRET because pointing someone else's bot at this
 * deployment, or this bot at someone else's, are both things a stranger should
 * not be able to do.
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return jsonError('Unauthorized.', 401);
  if (!telegramConfigured()) return jsonError('TELEGRAM_BOT_TOKEN is not set.', 503);

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!secret.trim()) return jsonError('TELEGRAM_WEBHOOK_SECRET is not set.', 503);

  const url = `${appUrl()}/api/telegram/webhook`;
  const ok = await setTelegramWebhook(url, secret);

  return ok
    ? jsonOk({ webhook: url, registered: true })
    : jsonError('Telegram refused the webhook registration. Check the token and that the URL is public.', 502);
}

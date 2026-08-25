# Launch checklist — mEEme.xyz

Everything an engineer could do without your credentials is done. What is left
below needs an account in your name, a card, or a click in a dashboard.

Ordered by what stops you making money soonest.

---

## 1. Connect the domain — 5 minutes

The app is a **Railway** service (`meeme-web`, project `meeme-xyz`). It is a
persistent Node process, not a serverless deployment, which is why the internal
cron scheduler works without an external pinger.

It is live right now at `https://meeme-web-production.up.railway.app`.

Railway's API exposes no way to create a custom domain, so this part is manual:

1. Railway dashboard → project **meeme-xyz** → service **meeme-web** →
   **Settings** → **Networking** → **Custom Domain**.
2. Add `meeme.xyz`. Add `www.meeme.xyz` as a second domain.
3. Railway shows a **CNAME target** for each — something ending in
   `.up.railway.app`. Copy it exactly; do not guess it, it is per-domain.
4. At your registrar's DNS, create:

   | Type            | Host  | Value                              |
   | --------------- | ----- | ---------------------------------- |
   | CNAME           | `www` | *(the target Railway showed)*      |
   | ALIAS / ANAME / CNAME-flattened | `@` | *(the target Railway showed)* |

   The apex (`@`) record is the awkward one: classic DNS forbids a CNAME at the
   apex, so your registrar must support ALIAS, ANAME, or CNAME flattening. If
   yours does not, move the nameservers to Cloudflare (free) and use its
   flattening. `.xyz` registrars commonly lack it.

5. Wait for Railway to show the domain as verified with a certificate issued.
   Usually minutes; DNS can take up to an hour.

### Then flip one environment variable

Once the domain resolves, set on the `meeme-web` service:

```
NEXTAUTH_URL=https://meeme.xyz
```

This has to happen **after** DNS works, not before — it is where Google sends
users back after sign-in, so pointing it at a domain that does not resolve yet
breaks sign-in on the Railway URL you are currently using.

Then add `https://meeme.xyz/api/auth/callback/google` as an authorised redirect
URI in the Google Cloud console, or sign-in fails with `redirect_uri_mismatch`.

---

## 2. Turn on payments — the actual blocker

**Nothing can charge a card until this is set.** Checkout currently returns
"Payments are not configured on this deployment."

Stripe products, prices and the webhook are already created and verified. The
one thing no API can hand over is the secret key — Stripe shows it once, at
creation.

1. Stripe dashboard → **Developers → API keys** → reveal the **live** secret key
   (`sk_live_…`).
2. Railway → `meeme-web` → **Variables** → add:

   ```
   STRIPE_SECRET_KEY=sk_live_...
   ```

3. Stripe dashboard → **Settings → Billing → Customer portal** → **Activate**.
   Without this, existing subscribers cannot cancel or update their card, and
   the `/api/stripe/portal` route returns an error. Activating it is also what
   makes the cancellation path in the terms of service true.

Already set and verified: `STRIPE_PRICE_DEGEN`, `STRIPE_PRICE_APEX`,
`STRIPE_WEBHOOK_SECRET` (pinned to API version `2025-02-24.acacia`, matching
the SDK).

**Test the whole path with a real card before you promote the site.** Subscribe,
confirm the tier badge changes in the header, then cancel from the portal.

---

## 3. Alerts — the thing paid tiers are actually for

Both are optional to launch, but DEGEN and APEX are sold on alerts, so
shipping without at least one makes the paid tiers thin.

- **Telegram** (primary): create a bot with @BotFather, then set
  `TELEGRAM_BOT_TOKEN`. `TELEGRAM_WEBHOOK_SECRET` is already set. Then hit
  `/api/telegram/setup` once to register the webhook.
- **Email** (fallback): create a Resend account, verify `meeme.xyz` as a sending
  domain, set `RESEND_API_KEY` and `ALERT_FROM_EMAIL`.

Set up the two mailboxes the legal pages promise, or forward them somewhere you
read: `support@meeme.xyz` and `privacy@meeme.xyz`. A privacy policy naming an
address that bounces is a worse look than not having one.

---

## 4. Optional data upgrades

The engine works with zero keys today — GeckoTerminal supplies the candles the
volume-profile model runs on. These improve it rather than enable it:

- `HELIUS_API_KEY` — turns on per-wallet cost-basis reconstruction and the
  insider-cluster forensics sold on the Apex tier, and enables the wallet
  scanner (currently returns a clear 503 without it).
- `BIRDEYE_API_KEY` — higher-resolution OHLCV than the keyless tier.

---

## 5. After launch

- Submit the sitemap (`https://meeme.xyz/sitemap.xml`) in Google Search Console.
- Watch `/api/diagnostics` — it makes a real call to every configured provider
  and reports what actually answered.
- Consider a Content-Security-Policy. It was deliberately left out of the
  security headers because doing it properly requires nonces for Next's inline
  scripts, and a CSP shipped blind breaks the site in ways that only show up in
  production.
- Get a lawyer to review `/terms`, `/privacy` and `/risk` before you are taking
  meaningful revenue. They are written against what the code actually does and
  are far better than a generic template, but they are not legal advice and a
  financial-analysis product carries real regulatory exposure that varies by
  jurisdiction.

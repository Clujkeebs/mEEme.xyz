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

### Why the X preview depends on this variable

The social card image URL is **absolute**, and the homepage is prerendered, so
`og:image` is baked at build time from `NEXTAUTH_URL`. If that variable were
missing during a build, the card would point at `localhost` and X would show no
image at all.

It is set on Railway, and Railway rebuilds whenever you change a variable — so
updating it to `https://meeme.xyz` re-bakes the card URLs correctly on its own.
Nothing to do here beyond the step above; it is documented because the failure
mode is silent.

After the domain is live, paste the URL into
[X's Card Validator](https://cards-dev.twitter.com/validator) once to prime
their crawler's cache. X caches aggressively — if you share the link before DNS
is ready, it can keep serving a blank card for hours.

---

## 2. Turn on payments

### ✅ Checkout can now charge a card

`STRIPE_SECRET_KEY` is set on Railway (confirmed present in the service's
variable list) and the deploy that picked it up is live and healthy. Checkout
should no longer return "Payments are not configured."

Also confirmed still correct via the Stripe API: `STRIPE_PRICE_DEGEN` /
`STRIPE_PRICE_APEX` point at active products, and the webhook
(`we_1U8SuhLoNTf2SutmUFkyFR7C`) is enabled, pinned to API version
`2025-02-24.acacia`, and listening for the right events.

### Optional upgrade — activate the Stripe customer portal

Checked directly against the Stripe API: `GET /v1/billing_portal/configurations`
returns an empty list. Live mode does not provision a default portal
configuration the way test mode does, and no operation on this Stripe
connection can create one.

**This no longer blocks launch.** Subscribers can cancel today: the Watchtower
header shows a *Manage billing* control, and when Stripe reports no portal
configuration the route returns a `portalUnavailable` flag and the UI offers a
prefilled cancellation email instead of failing. Cancellation works either way,
which is what the terms of service promise.

Activating it — **Stripe dashboard → Settings → Billing → Customer portal →
Activate** — upgrades that to full self-service: card updates, invoice history,
and cancellation without emailing anyone. Worth doing, but do it when you like.

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

The legal pages list `clujkeebs@aol.com` as the contact address, so there is no
mailbox to create — but note that it is now published on four public pages and
will be scraped. If you would rather not hand a personal inbox to spammers,
create `support@meeme.xyz` as a forwarding alias to it (most registrars include
email forwarding free with the domain) and change `CONTACT_EMAIL` in
`components/legal.tsx` — one line, and every page follows.

Separately, `ALERT_FROM_EMAIL` is the *sending* address for alerts and must stay
on a domain you control (`alerts@meeme.xyz`), because Resend requires a verified
sending domain and AOL will not let a third party send as you.

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

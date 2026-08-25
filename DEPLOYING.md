# Going live

**It is already deployed and running.**

- **App:** https://meeme-web-production.up.railway.app (Railway)
- **Database:** Supabase project `meeme-xyz`, schema applied, dedicated
  `meeme_app` role
- **Scheduler:** in-process, running sweep / score / scan

Steps 1 and 2 below are **already done**. Everything from step 3 is what is
left, and each one requires an account under your name, agreeing to terms, or
card details — which is why they are yours to do rather than mine.

Work top to bottom. After each block, hit `/api/diagnostics` — it makes a real
call to every configured provider and tells you what actually answered.

---

## 1. Database — ✅ done

A Supabase Postgres project (`meeme-xyz`) is provisioned, the baseline
migration is applied, and the app connects through a dedicated `meeme_app`
role rather than the superuser. `DATABASE_URL` is set on Railway.

Because Prisma created the tables as `meeme_app`, Supabase's default grants to
the public API roles never attached — `anon` and `authenticated` cannot read or
write any application table. Verified directly, not assumed. That means the
"RLS is disabled" advisory in the Supabase dashboard does not carry its usual
risk here; there is no PostgREST surface to protect.

## 2. Secrets — ✅ done

`NEXTAUTH_SECRET`, `CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET` are generated
and set on Railway. `NEXTAUTH_URL` points at the Railway domain — **change it
when you add your own domain**, and update the Google redirect URI and Stripe
webhook to match.

## 3. Price history — ✅ done, no key needed

Price history is what the cost-basis distribution is built from, so without it
there is no coil at all. This used to require a Birdeye key.

It no longer does: GeckoTerminal serves the same OHLCV for Solana pools with no
key, and DexScreener already resolves the pool address to ask about. The
mechanic works out of the box.

**Birdeye is now an optional upgrade.** The keyless tier is roughly 30
requests/minute, which is fine for on-demand reads and a 12-token scan every 30
minutes. If `/api/diagnostics` starts showing GeckoTerminal rate-limited as
traffic grows, that is when to add `BIRDEYE_API_KEY` — it is preferred
automatically when present, no code change.

## 4. Helius — insider forensics and wallet import

Without this: the read still works, but it cannot tell you what the
deployer-linked cluster paid, and wallet import is disabled.

1. [helius.dev](https://helius.dev) → sign up → copy the API key from the dashboard.
2. Set `HELIUS_API_KEY`.

Free tier is 1M credits/month, which is genuinely enough to start.

## 5. Google sign-in — 10 min, free

Without this: nobody can create an account, so nobody can subscribe.

1. [console.cloud.google.com](https://console.cloud.google.com) → new project.
2. **APIs & Services → OAuth consent screen** → External → fill in the basics.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Authorised redirect URI — exactly:
   `https://<your-domain>/api/auth/callback/google`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## 6. Telegram — this is what the paid tiers sell

Without this, alerts are written to the database and nobody ever sees them,
which makes "the engine watches while you sleep" untrue.

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → pick a name.
2. Set `TELEGRAM_BOT_TOKEN` (from BotFather) and `TELEGRAM_BOT_USERNAME`
   (the `@name`, without the `@`).
3. Redeploy, then register the webhook once:

```bash
curl -X POST https://<your-domain>/api/telegram/setup \
  -H "authorization: Bearer $CRON_SECRET"
```

Optional email fallback: [resend.com](https://resend.com) → API key →
`RESEND_API_KEY`, and `ALERT_FROM_EMAIL` on a domain you have verified there.

## 7. Stripe — most of it is done; two things need your hand on the dashboard

The product catalogue, prices, and webhook are provisioned via the Stripe MCP —
**live mode**, since that was the only mode this Stripe connection exposed:

| | |
|---|---|
| Degen | `prod_V8jbvt4j5uBwEo` — $4.99/mo — `price_1U8S81LoNTf2Sutm46pDyqQv` |
| Apex | `prod_V8jbgEyBfawHRd` — $19.99/mo — `price_1U8S83LoNTf2Sutm9iXWkRvP` |
| Webhook | `we_1U8SuhLoNTf2SutmUFkyFR7C` → `https://meeme-web-production.up.railway.app/api/stripe/webhook`, pinned to API version `2025-02-24.acacia` (matches the installed `stripe` SDK's types exactly, so a Stripe API upgrade elsewhere on the account can never change the shape of what this webhook receives) |

`STRIPE_PRICE_DEGEN`, `STRIPE_PRICE_APEX`, and `STRIPE_WEBHOOK_SECRET` are
already set on Railway. Two things could not be done through the API, both for
reasons worth knowing rather than working around:

1. **`STRIPE_SECRET_KEY`.** Stripe never returns a secret key through the API
   after it is created — there is no endpoint that hands one back, by design.
   Get it from **[dashboard.stripe.com](https://dashboard.stripe.com) →
   Developers → API keys → reveal the live secret key**, then set it on
   Railway:
   ```bash
   # or paste it directly in the Railway dashboard → meeme-web → Variables
   ```
   Nothing charges until this is set — `stripeConfigured()` checks for it, and
   the pricing page shows upgrade buttons as inert until it is present.

2. **Activate the customer portal.** The write endpoint for portal
   configuration is not exposed via the API in live mode — Stripe requires a
   human to activate it once from **[dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal)
   → Activate**. Until then, `/api/stripe/portal` (the "manage billing" link)
   returns an error instead of a portal session. Checkout itself is unaffected.

This account had no test mode available through the MCP connection, so nothing
here was validated against a `4242 4242 4242 4242` test card before going live.
**Run one real subscription through end to end** — sign up for Degen yourself,
confirm the webhook flips your tier, then cancel from the portal — before
telling anyone else the button works.

## 8. Scheduling — ✅ done

`ENABLE_INTERNAL_CRON=true` is set, so the app schedules its own jobs in-process
— sweep every 5 min, score hourly, scan every 30 min. Confirm in the Railway
logs; you should see:

```
[cron] internal scheduler started (sweep, score, scan)
```

The GitHub Actions workflow is still committed and still works, for running on
Vercel or any serverless host. Do not enable both against the same deployment —
you would double every alert.

## 9. Domain

Railway → service → **Settings → Networking → Custom Domain** → add
`meeme.xyz` and follow the CNAME instructions at your registrar. Then update
`NEXTAUTH_URL`, the Google redirect URI, the Stripe webhook URL, and re-run the
Telegram setup call.

---

## Order of operations, if you only do some of it

1. ~~Database + secrets~~ — done.
2. ~~Price history~~ — done, and keyless. The mechanic is on.
3. **Telegram** — without delivery there is nothing to charge for. Start here.
4. **Google + Stripe** — you cannot take money without both.
5. **Helius** — sharpens insider cost basis and unlocks wallet import.
6. **Birdeye** — only once GeckoTerminal's rate limit starts biting.

## First-run checks

```bash
curl https://<your-domain>/api/diagnostics | jq
```

Every provider should say "Answered". Then:

- Paste a real Solana contract into `/lock`. Confirm the coil method reads
  `hybrid` or `wallet` rather than `volume-profile` — if it says
  `volume-profile`, Helius is not answering.
- Sign in, connect Telegram, and use **Run workflow → sweep** in GitHub Actions
  to confirm a message lands.
- Let `/api/cron/scan` run a few times, then check `/track-record` has entries.
  Grades appear four hours after each call.

## What to watch in the first week

The engine has never been backtested. The track record is the instrument for
finding out whether the thesis holds, and it will be a small sample at first —
treat early accuracy numbers as noise until there are a few hundred graded
calls. If accuracy sits near 50% once the sample is real, the weights in
`lib/engine/coil.ts` are the thing to revisit, and every one of them is
documented with the claim about trader behaviour it encodes.

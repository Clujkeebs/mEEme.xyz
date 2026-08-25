# Going live

The app is deployed and **already works** — with no keys at all it runs in demo
mode: real engine, synthetic data, clearly labelled, and demo reads are barred
from the public track record.

This is the checklist to make it real. I could not do these steps for you: every
one requires creating an account under your name, agreeing to terms, or entering
payment details.

Work top to bottom. After each block, hit `/api/diagnostics` — it makes a real
call to every configured provider and tells you what actually answered.

---

## 1. Database — 5 min, free

Without this: nothing persists. No accounts, no positions, no track record.

1. [neon.tech](https://neon.tech) → new project → copy the **pooled** connection
   string (it has `-pooler` in the host).
2. Vercel → project → **Settings → Environment Variables**:
   - `DATABASE_URL` = that string
3. In `prisma/schema.prisma`, change `provider = "sqlite"` to
   `provider = "postgresql"`, commit, push.
4. Locally, once: `DATABASE_URL="<the string>" npx prisma db push`

> Neon's free tier suspends after inactivity and takes ~1s to wake. Fine for now;
> if cold starts become noticeable, Vercel Postgres or Supabase behave the same
> way on their free tiers.

## 2. Secrets — 1 min

```bash
openssl rand -base64 32   # → NEXTAUTH_SECRET
openssl rand -hex 32      # → CRON_SECRET
openssl rand -hex 32      # → TELEGRAM_WEBHOOK_SECRET
```

Also set `NEXTAUTH_URL` to your deployment origin, no trailing slash.

## 3. Birdeye — the one that turns the mechanic on

Without this: no price history, so no cost-basis distribution, so no coil. The
app degrades to structural analysis only and says so on screen.

1. [birdeye.so](https://birdeye.so) → Data Services → sign up → create an API key.
2. Set `BIRDEYE_API_KEY`.

The free tier is rate-limited. If `/api/diagnostics` shows Birdeye failing under
load, that is the limit, not a bug — the paid tier starts around $99/mo and is
the first thing worth spending money on.

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

## 7. Stripe — 15 min

Without this: everyone stays free and the upgrade buttons explain why.

1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Product catalogue**.
2. Two products, each with a **recurring monthly** price:
   - Degen — $4.99/mo
   - Apex — $19.99/mo
3. Copy each **price ID** (`price_...`, not the product ID) into
   `STRIPE_PRICE_DEGEN` and `STRIPE_PRICE_APEX`.
4. `STRIPE_SECRET_KEY` from **Developers → API keys**.
5. **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.payment_failed`
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Test with card `4242 4242 4242 4242` in test mode before switching to live keys.

## 8. Scheduling — required, free

Vercel's Hobby plan caps cron at two jobs running **once per day**, which is
useless for a sweep whose job is catching a stop as it breaks. GitHub Actions
runs the same endpoints on a real schedule, for free.

GitHub → repo → **Settings → Secrets and variables → Actions**:

- `MEEME_APP_URL` — your deployment origin, no trailing slash
- `MEEME_CRON_SECRET` — same value as `CRON_SECRET` in Vercel

The workflow is already committed. Confirm it under the **Actions** tab; you can
trigger any job by hand with **Run workflow**.

## 9. Domain

Vercel → **Settings → Domains** → add `meeme.xyz`, follow the DNS instructions
at your registrar. Then update `NEXTAUTH_URL`, the Google redirect URI, the
Stripe webhook URL, `MEEME_APP_URL`, and re-run the Telegram setup call.

---

## Order of operations, if you only do some of it

1. **Database + secrets** — nothing works without these.
2. **Birdeye** — this is what turns the mechanic on. Until it is set, the
   product is a structural scanner, and there are free ones of those.
3. **Telegram** — without delivery there is nothing to charge for.
4. **Google + Stripe** — you cannot take money without both.
5. **Helius** — sharpens the read and unlocks wallet import.

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

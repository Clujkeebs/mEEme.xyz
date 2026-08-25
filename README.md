# mEEme.xyz

**The EE is Exit Engine.**

Every memecoin tool is built for the entry. Entry is a race you cannot win —
median hold time on a Solana memecoin is about 100 seconds, co-located bots are
ahead of you by 400 milliseconds, and roughly 87% of same-block snipes are green
before you have seen the ticker.

The exit is not a race. It is a decision, and it is where retail actually bleeds
out. Around half of pump.fun wallets finish a month down and 96% end flat or
worse — not because they picked wrong, but because they sold the 40× at 2× and
held the rug to zero.

mEEme is built entirely for the second half of the trade.

---

## The mechanic: Coiled Supply Analysis

A memecoin's next move is not written in its candles. It is written in the
unrealized PnL of the wallets that already hold it.

The engine reconstructs what every reachable holder paid, then partitions the
float around spot:

| | |
|---|---|
| **Coiled supply** | Holders in profit, weighted by a saturating function of their multiple (a 2× holder is inert, a 10× is dangerous, a 100× is barely worse than the 10×) and by a behavioural urgency term — has this wallet already started selling, how dormant is it, is it an insider. |
| **Trapped supply** | Holders underwater. This is *structure*, not risk: deep bags do not sell into weakness. It is why a token "can't break" a level — that level is where a block of supply gets whole. |
| **Insider coil** | The same math restricted to deployer-linked wallets. Every scanner will tell you insiders exist. This tells you **what they paid and how much they have already dumped**. |
| **Velocity of realization** | Whether profitable supply is converting to cash *right now*, amplified by volume acceleration. Negative is accumulation, positive is distribution. |

### What comes out

Not a score. A **ladder** and a **trapdoor**.

The trapdoor is the price at which the largest block of in-profit supply goes to
breakeven. Below it, paper gains become a stampede. That is your stop — derived
from the book's own structure instead of a round-number rule.

```
DOGEFI | EXIT_IMMEDIATELY | coil 0.573 | conviction 0.55
  DOGEFI is being distributed right now — insiders have sold 77.7% of their bag.

  LADDER: Take 51% at market now · 24% at $0.011303 · 16% at $0.017585
          · 8% runs · hard stop $0.006866 (-33%).
  STOP  : volatility — nearest cascade level is 72% down, too far to be a real
          stop, so this is a volatility stop at 33% (3× average range).
```

The stop reports its own provenance. `structural` leans on a real shelf;
`volatility` means no shelf was close enough to be useful; `inside-noise` means
the cascade level is nearer than a single average candle — there is no stop that
survives the noise *and* protects you, so the honest answer is to size down
rather than pretend.

### Why this is an edge

- **It is non-consensus data.** RugCheck tells you a token is risky. DexScreener
  tells you the price. Neither will tell you the cost basis of the people about
  to dump on you. That quantity is derived, and nobody sells it.
- **Latency does not kill you.** Exit decisions play out over minutes. A web app
  genuinely competes here; on entry it never could.
- **It beats your own hands.** The edge in memecoins is asymmetry — win 15–25%,
  make 3–10× on winners. A precommitted ladder holds runners longer and cuts
  losers before they become losers.

---

## Quick start

```bash
npm run setup   # deps, .env, secrets, Prisma provider, schema
npm run dev     # http://localhost:3000
```

**With zero API keys this works immediately.** mEEme falls back to demo mode:
the engine is real and doing real work, the data is deterministic synthetic, every
read is labelled, and demo reads are permanently barred from the public track
record. Try the four pinned scenarios from the Target Lock screen.

Add keys to make it live. `/api/diagnostics` reports exactly what is and is not
answering.

---

## Environment

Full annotated list in [`.env.example`](.env.example). The short version:

### Required in production
| Variable | Notes |
|---|---|
| `DATABASE_URL` | `file:./dev.db` locally, a `postgresql://` URL in production. `npm run setup` rewrites the Prisma provider to match. |
| `NEXTAUTH_URL` | Public origin, no trailing slash. |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32`. Also salts anonymous rate limiting. |
| `CRON_SECRET` | `openssl rand -hex 32`. The cron routes **refuse to run** without it rather than sit open. |

### Market data
| Variable | What you lose without it |
|---|---|
| *(none)* — DexScreener | Nothing to set. Price, liquidity, volume, order flow. Required for any live read. |
| *(none)* — RugCheck | Nothing to set. Mint/freeze authority, LP lock, top holders, insider priors. |
| `BIRDEYE_API_KEY` | **The important one.** Price history is what the cost-basis distribution is built from. Without it there is no coil — only structural analysis — and the app says so on screen. |
| `HELIUS_API_KEY` | Insider cost basis, the holder book, and wallet import. The read still works without it; it just cannot tell you what the deployer-linked cluster paid. |

### Alert delivery — this is what the paid tiers actually sell
| Variable | Without it |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | No Telegram alerts. Create the bot with [@BotFather](https://t.me/BotFather) (`/newbot`), then `POST /api/telegram/setup` once with your `CRON_SECRET` to register the webhook. |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | No email fallback. |

If neither is set, alerts are written to the database and nobody ever sees them
— which makes "the engine watches while you sleep" untrue. Set at least one.

### Auth and payments — optional
| Variable | Without it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Sign-in is disabled; Target Lock still works. Redirect URI: `{NEXTAUTH_URL}/api/auth/callback/google` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_DEGEN`, `STRIPE_PRICE_APEX` | Everyone stays on the free tier and upgrade buttons explain why they are inert. |

---

## Deploying

**[DEPLOYING.md](DEPLOYING.md) is the go-live checklist** — every key you need,
where to get it, and what breaks without it, in the order that matters.

### Which host

**Railway is the better fit**, and the reasons are specific rather than
preference:

| | Vercel | Railway |
|---|---|---|
| Process model | serverless — Prisma reconnects after every idle period | persistent, connections stay warm |
| Cron | Hobby allows 2 jobs, **once per day** | any schedule, or the in-process scheduler below |
| Function ceiling | 60s | none |
| Postgres | separate provider | one click, or point at Supabase |

The cold-start difference is not cosmetic here: a Target Lock that waits on a
database handshake is a Target Lock the trader is watching a candle through.

On a persistent host, set `ENABLE_INTERNAL_CRON=true` and the app schedules its
own jobs in-process — no external pinger, no shared secret over the wire, no
best-effort scheduler skipping ticks. The HTTP cron endpoints still exist and
run the same code, so nothing is lost by using them instead.

Vercel works, and is the right choice if you want preview deployments per
branch. Use the GitHub Actions workflow for scheduling there.

## Deploying to Vercel

1. Push this branch and import the repo.
2. Provision Postgres (Vercel Postgres, Neon, Supabase) and set `DATABASE_URL`.
3. Set the environment variables above.
4. Set the Prisma provider to `postgresql` in `prisma/schema.prisma` — commit the
   change, or run `npm run setup` locally with the production `DATABASE_URL` set.
5. Run `npx prisma db push` once against the production database.
6. Add `CRON_SECRET` to the Vercel project; [`vercel.json`](vercel.json) already
   registers the two cron jobs.

The build runs `prisma generate` before `next build`, so no extra build command
is needed.

### Cron jobs

Vercel's **Hobby plan caps cron at two jobs running once per day**, which is
useless for a sweep whose purpose is catching a stop as it breaks. Scheduling
therefore runs from GitHub Actions ([`.github/workflows/cron.yml`](.github/workflows/cron.yml)),
which is free and runs on any schedule. Add two repository secrets under
**Settings → Secrets and variables → Actions**:

- `MEEME_APP_URL` — your deployment URL, no trailing slash
- `MEEME_CRON_SECRET` — the same value as `CRON_SECRET` in Vercel

| Path | Schedule | Job |
|---|---|---|
| `/api/cron/sweep` | every 5 min | Re-reads watched tokens and open positions, fires alerts on **crossings** (not levels, with a one-hour per-kind cooldown), then delivers everything undelivered. |
| `/api/cron/score` | hourly | Grades signals four hours past their call into the public track record. |
| `/api/cron/scan` | every 30 min | Reads live tokens autonomously so the ledger accumulates real graded calls without waiting for traffic. |

On Vercel Pro, delete the workflow and put the same schedules in `vercel.json`.

---

## The track record

Every tool in this space claims a win rate and none will tell you how it was
measured. Ours is in [`lib/scoring.ts`](lib/scoring.ts), versioned, and applied
automatically four hours after each call:

- **Exit calls** are right when price fell 10%+, wrong when it ran 15%+ without you.
- **Entry calls** are right when price rose 10%+, wrong when it fell 10%+.
- **ARM EXIT** is vindicated by the drawdown it warned about, even if price later
  recovered — that is what a warning is for.
- Anything smaller is **neutral and excluded from accuracy**. Not counted as a win.
- Demo reads never enter the ledger.

It is published at `/track-record`, losses included. That is the moat: in a
market where every tool lies about its hit rate, publishing yours is both the
trust argument and the marketing.

---

## The public API (Apex)

```bash
curl -H "Authorization: Bearer meeme_live_..." \
  "https://your-app/api/v1/lock?address=<mint>"

# with your position, for a ladder read from your entry
  ...&entry=0.0000042&size=1200000
```

Keys are issued from the watchtower and stored only as SHA-256 hashes — a
database dump yields nothing usable, and there is no code path, including ours,
that can reproduce a key after issuance. 5,000 calls/day.

---

## Architecture

```
lib/engine/          Pure math. No I/O, no clock, no randomness.
  types.ts           The normalized TokenSnapshot every provider produces.
  distribution.ts    Cost-basis distribution: volume profile + wallet overlay.
  coil.ts            Coiled/trapped supply, shelves, velocity, structural risk.
  cluster.ts         Per-wallet reconstruction and insider-cluster detection.
  ladder.ts          Ladder construction and stop resolution.
  verdict.ts         Seven calls, conviction, and the reasoning behind each.

lib/providers/       Adapters. Every one is allowed to fail.
  http.ts            Timeouts, bounded retries, zod validation on every response.
  dexscreener.ts     Price, liquidity, flow.        (no key)
  rugcheck.ts        Authorities, LP lock.          (no key)
  birdeye.ts         Price history — feeds the distribution. (key)
  helius.ts          Holder book, per-wallet history.        (key)
  wallet.ts          Public-address position discovery.      (key)
  discover.ts        Candidate tokens for the autonomous scan.
  demo.ts            Deterministic synthetic tokens.
  index.ts           Assembly, degradation, honest coverage reporting.

lib/notify/          Telegram and email delivery, quiet hours, retries.
lib/apikey.ts        Hashed API keys for the Apex tier.

app/api/lock/        The whole product in one request.
app/api/v1/lock/     The same thing, for someone else's bot.
app/api/cron/        The half that works while you are asleep.
```

### How the mechanic gets its data

Reconstructing cost basis by replaying a token's whole trade history does not
work: a live memecoin has tens of thousands of swaps and no free API pages
through them inside a request. A truncated replay produces wallets whose
reconstructed balance disagrees with the chain, which the engine then correctly
refuses to price — so the distribution comes back empty and the mechanic
silently produces nothing.

So the float's cost basis comes from price history instead. Each candle records
`volume / price` tokens changing hands at that price; under a random-reselection
model the share still held is `exp(-turnover_since / float)`. Walking backwards
from spot gives the distribution from OHLCV alone. Per-wallet reconstruction is
kept only for the insider cluster — a few dozen addresses whose individual
histories are genuinely short — and overlaid on top.

`CoilReport.method` reports which path produced a given read (`wallet`,
`hybrid`, `volume-profile`, `none`), and the UI shows it, because it changes
what the numbers mean.

The engine never touches the network, which is what makes it testable and what
makes the numbers reproducible. Providers produce a snapshot; the engine reads it.

```bash
npm test        # 148 tests
npm run typecheck
npm run lint
```

---

## Known limitations — read this before trusting a number

These are real, and the app is built to state them rather than hide them.

1. **Provider response shapes are validated at runtime, not at author time.**
   The environment this was built in could not reach `api.dexscreener.com`,
   `api.rugcheck.xyz` or the other market-data hosts — outbound egress policy
   blocked them — so the zod schemas were written from documentation and are
   deliberately lenient. **Run `/api/diagnostics` on first deploy.** It makes a
   real call to every configured provider and reports whether the response
   parsed. If a shape has drifted, the parse fails loudly in the logs and that
   provider degrades rather than corrupting a read. Nothing silently invents data.

2. **The volume profile is a model, not a measurement.** It assumes tokens are
   reselected for trading at random, which is wrong in the specific way that
   matters: insiders trade more than the average holder. That is precisely why
   the insider cluster is priced per wallet and overlaid rather than left to the
   model. Where the profile carries the read alone, `method` says
   `volume-profile` and confidence is discounted for it.

3. **Insider cost basis is an approximation.** Swap USD value attributes a
   transaction's whole native leg to its token leg. Where a reconstructed
   balance drifts more than 25% from the on-chain balance, the engine **refuses
   to report a cost basis** for that wallet rather than guess.

4. **Wallet-entry reconstruction only sees recent history** (300 transactions).
   A trader whose buys predate that window gets their positions listed without
   an entry price, and is told so rather than shown a fabricated one.

5. **Solana only.** The types carry a `chain` field and the engine is
   chain-agnostic, but only Solana providers are implemented.

6. **The engine has never been backtested against realized outcomes.** The
   weights and thresholds encode reasoning about trader psychology, not fitted
   parameters. That is exactly why the track record exists and why it is public
   from day one — it is the instrument for finding out whether the thesis holds.
   Treat early accuracy numbers as a small sample.

---

## Security posture

`npm audit` is clean of everything fixable inside the current major versions.
Two findings remain, against `next` and `postcss`, and npm resolves both only
by upgrading to **next@16** — a major version bump that this codebase targets
Next 14 by design.

They are recorded here rather than carried silently. Nearly all are denial of
service or cache-poisoning classes that assume a self-hosted image optimizer, a
custom server, or middleware rewrites — none of which this app uses. That makes
them low exposure for this deployment, not absent.

The upgrade to Next 16 is a real piece of work (App Router APIs, `next/image`,
middleware signatures) and wants doing deliberately rather than as a
side effect of an audit run. Until then:

```bash
npm audit --omit=dev   # see exactly what is outstanding
```

Railway's builder refuses a deploy on HIGH-severity advisories, which is how the
original `next@14.2.33` CVEs were caught — Vercel had built the same commit
without complaint. Worth keeping in mind when choosing where this runs.

## Not financial advice

mEEme reads on-chain supply structure and tells you what it sees. It does not
know the future, it cannot execute for you, and it has no idea what you can
afford to lose. It never connects to your wallet and never asks you to sign a
transaction — it cannot move your funds because it was never given the ability.

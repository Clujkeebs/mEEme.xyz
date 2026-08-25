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

### Market data — all optional, each degrades rather than breaks
| Variable | What you lose without it |
|---|---|
| *(none)* — DexScreener | Nothing to set. Price, liquidity, volume, order flow. Required for any live read. |
| *(none)* — RugCheck | Nothing to set. Mint/freeze authority, LP lock, top holders, insider priors. |
| `HELIUS_API_KEY` | **The important one.** Holder balances and swap history — the inputs to cost basis. Without it there is no coil at all, only structural analysis, and the app says so on screen. |
| `BIRDEYE_API_KEY` | The chart, and the volatility term in the stop. |

### Auth and payments — optional
| Variable | Without it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Sign-in is disabled; Target Lock still works. Redirect URI: `{NEXTAUTH_URL}/api/auth/callback/google` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_DEGEN`, `STRIPE_PRICE_APEX` | Everyone stays on the free tier and upgrade buttons explain why they are inert. |

---

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
| Path | Schedule | Job |
|---|---|---|
| `/api/cron/sweep` | every 5 min | Re-reads watched tokens and open positions; fires alerts on **crossings**, not levels, with a one-hour per-kind cooldown. |
| `/api/cron/score` | hourly | Grades signals that are four hours past their call into the public track record. |

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

## Architecture

```
lib/engine/          Pure math. No I/O, no clock, no randomness.
  types.ts           The normalized TokenSnapshot every provider produces.
  coil.ts            Coiled/trapped supply, shelves, velocity, structural risk.
  cluster.ts         Cost-basis reconstruction and insider-cluster detection.
  ladder.ts          Ladder construction and stop resolution.
  verdict.ts         Seven calls, conviction, and the reasoning behind each.

lib/providers/       Adapters. Every one is allowed to fail.
  http.ts            Timeouts, bounded retries, zod validation on every response.
  dexscreener.ts     Price, liquidity, flow.   (no key)
  rugcheck.ts        Authorities, LP lock.     (no key)
  helius.ts          Holder book, swap history.(key)
  birdeye.ts         Candles, SOL price.       (key)
  demo.ts            Deterministic synthetic tokens.
  index.ts           Assembly, degradation, honest dataQuality reporting.

app/api/lock/        The whole product in one request.
app/api/cron/        The half that works while you are asleep.
```

The engine never touches the network, which is what makes it testable and what
makes the numbers reproducible. Providers produce a snapshot; the engine reads it.

```bash
npm test        # 114 tests
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
   deliberately lenient. **Run `/api/diagnostics` on first deploy.** If a shape
   has drifted, the parse fails loudly in the logs and that provider degrades
   rather than corrupting a read. Nothing silently invents data.

2. **Cost basis is an approximation.** Swap USD value is derived by attributing
   a transaction's whole native leg to its token leg. Where reconstructed
   balances drift more than 25% from the on-chain balance, the engine **refuses
   to report a cost basis** for that wallet rather than guess — which is why
   `supplyCovered` is on screen and why confidence falls when it is low.

3. **Holder and history pagination is capped** (5 pages each) so requests finish
   inside a serverless timeout. On a token with hundreds of thousands of holders
   the top wallets are covered and the tail is not; coverage is reported and
   confidence is discounted accordingly.

4. **Solana only.** The types carry a `chain` field and the engine is
   chain-agnostic, but only Solana providers are implemented.

5. **The engine has never been backtested against realized outcomes.** The
   weights and thresholds encode reasoning about trader psychology, not fitted
   parameters. That is exactly why the track record exists and why it is public
   from day one — it is the instrument for finding out whether the thesis holds.
   Treat early accuracy numbers as a small sample.

---

## Not financial advice

mEEme reads on-chain supply structure and tells you what it sees. It does not
know the future, it cannot execute for you, and it has no idea what you can
afford to lose. It never connects to your wallet and never asks you to sign a
transaction — it cannot move your funds because it was never given the ability.

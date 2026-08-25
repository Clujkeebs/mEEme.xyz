#!/usr/bin/env bash
#
# mEEme.xyz — one-command setup.
#
#   npm run setup
#
# Idempotent: safe to re-run. Never overwrites an existing .env.
set -euo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

say "${BOLD}mEEme.xyz setup${RESET}"
say ""

# ── Node ─────────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js is not installed. Install Node 18.17 or newer."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node $(node -v) is too old. mEEme needs Node 18.17 or newer."
ok "Node $(node -v)"

# ── Dependencies ─────────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  say "Installing dependencies…"
  npm install
fi
ok "Dependencies installed"

# ── Environment ──────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  ok ".env already exists — leaving it alone"
fi

# A signing secret is required for sessions and for salting anonymous rate
# limits. Generate one if the file still has the empty placeholder.
if grep -qE '^NEXTAUTH_SECRET=""[[:space:]]*$' .env; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 32)"
  else
    SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
  fi
  # Portable in-place edit: BSD sed and GNU sed disagree about -i.
  tmp="$(mktemp)"
  sed "s|^NEXTAUTH_SECRET=\"\"|NEXTAUTH_SECRET=\"${SECRET//|/\\|}\"|" .env > "$tmp" && mv "$tmp" .env
  ok "Generated NEXTAUTH_SECRET"
fi

if grep -qE '^CRON_SECRET=""[[:space:]]*$' .env; then
  if command -v openssl >/dev/null 2>&1; then
    CRON="$(openssl rand -hex 32)"
  else
    CRON="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  fi
  tmp="$(mktemp)"
  sed "s|^CRON_SECRET=\"\"|CRON_SECRET=\"$CRON\"|" .env > "$tmp" && mv "$tmp" .env
  ok "Generated CRON_SECRET"
fi

# ── Database provider ────────────────────────────────────────────────────────
# Prisma will not take the provider from an env var, so the schema is rewritten
# to match whichever DATABASE_URL is actually configured.
DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)"
[ -n "$DB_URL" ] || die "DATABASE_URL is empty in .env"

case "$DB_URL" in
  file:*)               PROVIDER="sqlite" ;;
  postgres://*|postgresql://*) PROVIDER="postgresql" ;;
  mysql://*)            PROVIDER="mysql" ;;
  *) die "Unrecognised DATABASE_URL. Use file:./dev.db for local, or a postgresql:// URL." ;;
esac

CURRENT="$(grep -A2 '^datasource db' prisma/schema.prisma | grep 'provider' | sed 's/.*"\(.*\)".*/\1/')"
if [ "$CURRENT" != "$PROVIDER" ]; then
  tmp="$(mktemp)"
  awk -v p="$PROVIDER" '
    /^datasource db/ { inblock=1 }
    inblock && /provider[[:space:]]*=/ { sub(/"[^"]*"/, "\"" p "\""); inblock=0 }
    { print }
  ' prisma/schema.prisma > "$tmp" && mv "$tmp" prisma/schema.prisma
  ok "Set Prisma provider to $PROVIDER"
else
  ok "Prisma provider is already $PROVIDER"
fi

# ── Schema ───────────────────────────────────────────────────────────────────
npx prisma generate >/dev/null
ok "Prisma client generated"

if npx prisma db push --skip-generate >/dev/null 2>&1; then
  ok "Database schema synced"
else
  warn "Could not sync the schema. Check DATABASE_URL, then run: npx prisma db push"
fi

# ── What is actually live ────────────────────────────────────────────────────
say ""
say "${BOLD}Provider status${RESET}"
check_key() {
  if grep -qE "^$1=\"\"?[[:space:]]*$" .env || ! grep -q "^$1=" .env; then
    printf '  %s—%s %-22s %s\n' "$YELLOW" "$RESET" "$1" "$2"
  else
    printf '  %s✓%s %-22s configured\n' "$GREEN" "$RESET" "$1"
  fi
}
printf '  %s✓%s %-22s no key needed\n' "$GREEN" "$RESET" "DexScreener"
printf '  %s✓%s %-22s no key needed\n' "$GREEN" "$RESET" "RugCheck"
check_key HELIUS_API_KEY       "no cost basis, so no coil — structural analysis only"
check_key BIRDEYE_API_KEY      "no chart; stop falls back to a default range"
check_key GOOGLE_CLIENT_ID     "sign-in disabled"
check_key STRIPE_SECRET_KEY    "everyone stays on the free tier"

say ""
say "${BOLD}Ready.${RESET}"
say "  npm run dev      → http://localhost:3000"
say "  /api/diagnostics → confirms which providers actually answer"
say ""
say "With no keys at all, mEEme runs in demo mode: the engine is real, the data"
say "is synthetic and clearly labelled, and demo reads never enter the ledger."

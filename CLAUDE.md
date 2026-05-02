# fx-tracker

Self-hosted FX rate tracker for remittance comparison. TypeScript monorepo, pnpm workspaces, Docker Compose for deployment.

Design spec: `/Users/mgupta/.claude/plans/i-want-to-create-sorted-bear.md`

## Commands

```bash
pnpm install                                # workspace deps
pnpm -r typecheck                           # tsc --noEmit across all packages
pnpm -r test                                # unit tests (no network)

# Live tests — opt-in via env flag, hit real endpoints
pnpm --filter @fx/core run test:live              # 13 HTTP-API tests, ~10s
pnpm --filter @fx/core run test:live:scrape       # required-tier Playwright (Google Finance only)
pnpm --filter @fx/core run test:live:scrape:fragile  # advisory-tier (masarif/lulu/careem/wu/rf — may fail; informational)
pnpm --filter @fx/core run test:live:all          # everything

# DB
pnpm --filter @fx/core run db:generate      # generate migration from schema.ts
pnpm --filter @fx/core run db:migrate       # apply migrations to $DATABASE_URL

# Local stack
docker compose up                           # postgres + web + worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d   # prod (with Caddy TLS)
```

## Architecture

Three workspaces orchestrated via pnpm:

- **`packages/core`** — shared. DB schema (Drizzle), `RateProvider` plugin interface, alert evaluator, Telegram client, mid-market computation.
- **`apps/web`** — Next.js (App Router). Public dashboard at `/`, gated `/alerts` admin (iron-session + bcrypt).
- **`apps/worker`** — Node + node-cron. Polls every hour (`POLL_INTERVAL_CRON`), evaluates interval alerts every minute. Hosts the Playwright pool for scrape providers.

The web tier never invokes scrapers — slow scrapes only run inside the worker so they can't block the UI.

## Key Files

- `config/providers.yml` — pair → providers manifest. Edit + restart worker to add/remove providers.
- `packages/core/src/providers/` — one file per provider plugin. Register in `providers/index.ts`.
- `packages/core/src/db/schema.ts` — Drizzle schema. Run `db:generate` after edits.
- `packages/core/src/alerts/evaluator.ts` — edge-triggered threshold logic, idempotent fires.
- `packages/core/src/midMarket.ts` — median-of-survivors with outlier guard.
- `apps/worker/src/jobs/pollRates.ts` — the hourly poll cycle. Cross-provider dedup via `dedupeQuotes`.
- `apps/web/middleware.ts` — security headers (CSP/HSTS/XFO).

## Provider plugin model

Adding a new remittance provider:
1. Drop `packages/core/src/providers/<id>.ts` implementing `RateProvider`.
2. Register in `packages/core/src/providers/index.ts`.
3. Add `<id>` under the relevant pair in `config/providers.yml`.
4. Restart worker. Health visible in the `provider_runs` table.

Tiers (declared via plugin's `kind` field):
- **`api`** — direct JSON. Most reliable. Examples: Wise, Instarem, Aspora.
- **`aggregator`** — one call yields multiple providers. Examples: masarif (UAE houses via scrape), Wise comparisons, Aspora API (returns Aspora + Wise + Remitly).
- **`scrape`** — Playwright fallback. Best-effort.

## Gotchas

- **Wise's `/v3/comparisons/` returns an empty `providers` array for AED→INR.** Plugins relying on it (e.g. remitly's first fallback) silently get no Wise data for that corridor; design for it.
- **Remitly has two rates per page**: a "promotional" first-transfer rate (~95.34) and a "standard" non-promo rate (~94.66). The promo only renders alone; the standard rate appears as `Standard rate 1 X = N INR applies to the rest of the transfer` ONLY when you fill the calculator with `amount > promo_cap` (6000 USD or 4000 AED). The plugin drives the calculator via Playwright to capture standard. Resolution order: `wise_comparisons` then `remitly_standard`. **Never fall back to the promo rate** — it's BETTER than mid (Remitly subsidises first transfers) and would rank Remitly artificially at the top of the comparison. If both standard sources fail the provider throws and the row appears under "configured · not reporting".
- **Instarem's old `/api/v1/public/transaction/computed-rate` endpoint now returns "Session Expired".** The replacement is `/api/v1/public/transaction/computed-value` with required `country_code` (e.g. `country_code=US` for USD-INR). AED→INR is *not* an Instarem corridor (the API rejects it with "Invalid combination of country-currency details"), so `instaremProvider.supports()` is USD-INR only and Instarem is removed from the AED-INR provider list.
- **Mid-market source rates also land in `reference_rates`.** `pollRates` step 1b writes each successful per-source rate from the median computation (`wiseMidMarket`, `xe`, `exchangerateHost`) as a reference row, even though only `googleFinance` appears in `pairCfg.referenceSources`. Don't add those mid-market sources to `referenceSources` or you'll double-fetch.
- **Aspora's API expects `amount` not `send_amount`** (the latter returns 400 with "converted to 0.00"). Endpoint: `POST https://api-z1.aspora.com/appserver/public-forex-provider/get-rates` with `{ base_currency, quote_currency, amount }`.
- **Google Finance**: use selector `div.N6SYTe` (single occurrence per page = the primary quote). `[jsname="Pdsbrc"]` matches dozens of unrelated tickers in the sidebar.
- **`exchangerate.host` now requires an API key.** We use `open.er-api.com/v6/latest/X` instead (free, no key); the source ID is still `exchangerateHost` for config compatibility.
- **`fetchWiseComparison` memoizes for 60s.** Tests must call `__resetWiseComparisonCache()` in `beforeEach` or rates leak across tests.
- **Cross-provider dedup runs after `Promise.allSettled`, not per-call.** `dedupeQuotes` (in `packages/core/src/dedupe.ts`) consolidates aggregator outputs using `preferredSource`. Don't reintroduce per-provider dedup — it makes `preferredSource` dead code.
- **Scrape selectors are best-effort.** masarif, lulu, careemPay, remitfinder, westernUnion failures are expected; system records `provider_runs.status='error'` and continues. They're documented in `config/providers.yml` reliability tier comments.
- **Threshold rules are edge-triggered.** `lastObservedSide` advances ONLY on fire (not during cooldown). New rules call `armRuleAtCurrentSide` so they don't fire retrospectively on first poll.
- **Alerts that compare across providers must use a single `referenceAmount`.** `pickSnapshotAmount` in evaluator.ts handles this — don't bypass.
- **Auth gotchas**: `SESSION_SECRET` throws in production if missing or <32 chars; `safeNextPath` rejects protocol-relative + absolute redirects (open-redirect guard).
- **Hardcode regexes per corridor.** Semgrep flags dynamic `new RegExp(`...${pair}...`)` as ReDoS risk. Pattern: `Record<'USD-INR' | 'AED-INR', RegExp>`.

## Testing

- **Unit tests** mock `fetch` via `test/helpers/mockFetch.ts`. Most provider tests use fixtures from `test/fixtures/`.
- **Playwright in unit tests is mocked** via `vi.mock('../../src/scrape/browserPool.js', ...)`. Otherwise unit tests would launch real Chromium.
- **Live tests are env-gated** (`FX_LIVE=1`, `FX_LIVE_SCRAPE=1`, `FX_LIVE_SCRAPE_FRAGILE=1`). Unset by default — `pnpm test` never hits the network.
- Default tests should pass without Postgres or Telegram set.

## Environment

`.env` (copy from `.env.example`):
- `DATABASE_URL` — Postgres
- `ADMIN_PASSWORD_HASH` — bcrypt hash for `/alerts` login
- `SESSION_SECRET` — 32+ chars
- `TELEGRAM_BOT_TOKEN` — outbound only, no webhook server
- `TELEGRAM_ADMIN_CHAT_ID` — for self-alerts on persistent provider failures
- `POLL_INTERVAL_CRON` (default `0 * * * *`)
- `ALERT_TICK_CRON` (default `*/1 * * * *`)
- `SITE_DOMAIN` — for Caddy TLS in prod

## Discovery scripts

`packages/core/scripts/` contains Playwright-based probes used to discover provider APIs and DOM selectors. Re-run when a scraper breaks:

```bash
cd packages/core
node scripts/discoverApis.mjs           # XHR/fetch capture across all sites
node scripts/inspectDom.mjs             # DOM inspection for rate elements
node scripts/probeAspora.mjs            # body-shape probe
node scripts/probeRemitly5.mjs          # calculator-driven standard rate probe
node scripts/smokeRemitly.ts            # quick live rate sanity check
```

## Memory references

User-level provider API surface notes saved at `/Users/mgupta/.claude/projects/-Users-mgupta-Development-fx-tracker/memory/reference_provider_apis.md` — what each provider exposes (API vs scrape), discovered shapes, and quirks. Future sessions should consult before re-running discovery.

## Production deployment

Operational details — host address, on-server paths, deploy commands, ops runbook — live in **`PROD.md`** at the repo root. That file is **gitignored** so infra details never leave the dev machine. Read it before any prod-related task. If it's missing on a fresh checkout, regenerate from the deploy notes in this CLAUDE.md or recover from the dev-machine backup.

**Phasing.** Prod ops over SSH (rebuilding containers, swapping the working tree) must be split into **Phase 1: preview** — `git fetch`, show incoming commits, sanity-check disk/mem, do *not* touch running containers — and **Phase 2: apply** (`git pull --ff-only && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`). The harness blocks bundled deploy commands; splitting also makes rollback trivial. See auto-memory `feedback_prod_deploys.md`.

**SSH key.** Server access is `ssh root@178.104.217.111` using the passphrase-protected key `~/.ssh/general` (ED25519, fingerprint `SHA256:tQFL5i64fZ44O1c0G38YONmpifbBSZRPwGcsVC1njoo`). If `ssh-add -l` doesn't show that fingerprint, ask the user to run `ssh-add --apple-use-keychain ~/.ssh/general` once; the passphrase lives in their macOS keychain so subsequent unlocks are silent. The harness can't enter passphrases, so `ssh` to this host fails with `Permission denied (publickey,password)` until the agent is loaded. Don't try other keys (`hetzner-dedi-2`, `mudit-delta`, etc) — they're for unrelated hosts.

Secrets (`SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `TELEGRAM_BOT_TOKEN`, `POSTGRES_PASSWORD`) live ONLY in `/opt/fx-tracker/.env` on the server — never in `PROD.md`, never in this repo, never in chat.

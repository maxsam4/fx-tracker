# fx-tracker

Self-hosted FX rate tracker for remittance comparison.

- **Pairs:** USD→INR, AED→INR (configurable in `config/providers.yml`)
- **Mid-market:** median of Wise + XE + exchangerate.host
- **Provider quotes:** raw `(rate, fee, amount)` captured per poll, effective rate computed on read
- **Alerts:** Telegram, interval or threshold-based, includes all providers within 1% of mid-market

See the full design at `/Users/mgupta/.claude/plans/i-want-to-create-sorted-bear.md`.

## Quick start (local)

```bash
cp .env.example .env
# edit .env: set ADMIN_PASSWORD_HASH and SESSION_SECRET at minimum
docker compose up
```

Open http://localhost:3000

## Stack

- TypeScript end-to-end. pnpm workspaces.
- `apps/web` — Next.js (App Router) dashboard + admin
- `apps/worker` — `node-cron` scheduler + provider scrapers
- `packages/core` — DB schema (Drizzle), provider plugin interface, alert logic
- Postgres 16, Caddy (TLS, prod only)

## Adding a remittance provider

1. Drop a file at `packages/core/src/providers/<id>.ts` implementing `RateProvider`.
2. Register it in `packages/core/src/providers/index.ts`.
3. Add the id under the relevant pair in `config/providers.yml`.
4. Restart the worker.

See `packages/core/src/providers/wise.ts` as a reference.

## Testing

```bash
pnpm test                  # vitest across packages
pnpm typecheck             # tsc --noEmit across packages
```

## Production deploy (Hetzner)

```bash
ssh user@server
git clone <repo> && cd fx-tracker
cp .env.example .env  # set SITE_DOMAIN, secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Caddy will auto-issue TLS for `SITE_DOMAIN`.

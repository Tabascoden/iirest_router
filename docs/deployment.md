# Deployment

## VPS Requirements

Install Docker and Docker Compose. Expose only `80` and `443` publicly through a reverse proxy such as nginx or Caddy. Do not expose Postgres to the internet.

## Configure

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```env
POSTGRES_PASSWORD=<strong password>
DATABASE_URL=postgresql://iirest:<same password>@postgres:5432/iirest_router
PUBLIC_BASE_URL=https://router.example.com
```

For Telegram production, also set:

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<telegram token>
TELEGRAM_WEBHOOK_SECRET=<random secret>
```

For Max production webhook mode, set:

```env
TELEGRAM_ENABLED=false
MAX_ENABLED=true
MAX_MOCK_ENABLED=false
MAX_BOT_TOKEN=<max token>
MAX_WEBHOOK_SECRET=<5-256 chars: A-Z, a-z, 0-9, underscore, hyphen>
MAX_WEBHOOK_BOT_KEY=main
MAX_API_BASE_URL=https://platform-api.max.ru
MAX_SEND_TIMEOUT_MS=10000
MAX_SEND_FORMAT=
```

## Start

```bash
docker compose up -d --build
docker compose exec router npm run db:migrate
```

The router port is bound to `127.0.0.1:${PORT:-3000}`. Put the reverse proxy in front of it and terminate TLS there.

## Telegram Webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://router.example.com/webhooks/telegram/main&secret_token=<SECRET>"
```

## Max Webhook

MAX production delivery uses HTTPS webhooks, not Long Polling. The public endpoint must be reachable on port 443 with a trusted TLS certificate and return HTTP 200 within 30 seconds.

```bash
docker compose exec router npm run max:subscribe
docker compose exec router npm run max:subscriptions
```

To remove the configured endpoint:

```bash
docker compose exec router npm run max:unsubscribe
```

## Create Assistant

```bash
docker compose exec router npm run routerctl -- assistant create \
  --title "Adzhapuri Assistant" \
  --relay-account relay_adzhapuri
```

Save the printed relay token and configure it in the foreign relay worker.

## Add User

See `docs/manual-user-management.md`.

## Mock Relay

```bash
docker compose exec router npm run mock:relay -- \
  --relay-account relay_adzhapuri \
  --token rt_...
```

## Logs and Smoke

```bash
docker compose logs -f router
docker compose exec router npm run smoke
```

## Backup and First Client

Before connecting real clients, read:

```text
docs/backup-restore.md
docs/first-client-runbook.md
```

## Safety Notes

Postgres is not published with `ports`; it is only available inside the Docker network via `postgres:5432`. Daily context rotation uses `DAILY_CONTEXT_ROTATION_TIMEZONE`, not container local time. Max is disabled by default and requires `MAX_BOT_TOKEN` plus `MAX_WEBHOOK_SECRET` when enabled in production. Dev endpoints require both `NODE_ENV=development` and `DEV_ENDPOINTS_ENABLED=true`.

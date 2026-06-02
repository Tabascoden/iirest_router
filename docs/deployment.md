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
TELEGRAM_BOT_TOKEN=<telegram token>
TELEGRAM_WEBHOOK_SECRET=<random secret>
PUBLIC_BASE_URL=https://router.example.com
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

## Safety Notes

Postgres is not published with `ports`; it is only available inside the Docker network via `postgres:5432`. Max is scaffold-only and disabled by default. Dev endpoints require both `NODE_ENV=development` and `DEV_ENDPOINTS_ENABLED=true`.

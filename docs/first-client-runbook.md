# First Client Runbook

This is the operator checklist for connecting the first real client.

## 1. Prepare VPS

- Docker and Docker Compose are installed.
- Reverse proxy is configured with HTTPS.
- Firewall exposes only SSH, 80, and 443.
- Postgres is not publicly exposed.

## 2. Configure `.env`

Minimum production values:

```env
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://router.example.com
POSTGRES_PASSWORD=<strong password>
DATABASE_URL=postgresql://iirest:<strong password>@postgres:5432/iirest_router
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<telegram token>
TELEGRAM_WEBHOOK_SECRET=<random secret>
QUEUE_WHEN_RELAY_OFFLINE=false
MAX_ENABLED=false
MAX_MOCK_ENABLED=false
LOG_PII=false
```

## 3. Start Service

```bash
docker compose up -d --build
docker compose exec router npm run db:migrate
docker compose exec router npm run smoke
```

## 4. Configure Telegram Webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://router.example.com/webhooks/telegram/main&secret_token=<SECRET>"
```

## 5. Create Assistant

```bash
docker compose exec router npm run routerctl -- assistant create \
  --title "CLIENT_NAME Assistant" \
  --relay-account relay_client_name
```

Save the printed relay token. It is shown only once.

## 6. Configure Relay Worker

For mock relay testing:

```bash
docker compose exec router npm run mock:relay -- \
  --relay-account relay_client_name \
  --token rt_...
```

For a real foreign worker:

```env
IIREST_ROUTER_WS_URL=wss://router.example.com/relay/stream
IIREST_RELAY_ACCOUNT_ID=relay_client_name
IIREST_RELAY_TOKEN=rt_...
```

## 7. Add User

The user sends `/start` and receives an ID like:

```text
telegram:123456789
```

Operator runs:

```bash
docker compose exec router npm run routerctl -- user create --title "User Name"

docker compose exec router npm run routerctl -- identity add \
  --user user_... \
  --platform telegram \
  --platform-user-id 123456789 \
  --chat-id 123456789 \
  --display-name "User Name"

docker compose exec router npm run routerctl -- user grant-assistant \
  --user user_... \
  --assistant asst_...
```

## 8. End-to-End Check

1. User sends a test message.
2. Router creates a job.
3. Relay receives `inbound.message`.
4. Relay sends `ack` and `outbound.message`.
5. User receives the reply in Telegram.
6. Logs show `outbound_delivered`.

Useful commands:

```bash
docker compose logs --tail=200 router
docker compose exec router npm run routerctl -- relay list
docker compose exec router npm run routerctl -- jobs list --status active
```

## 9. Rollback

```bash
docker compose logs --tail=200 router
docker compose restart router
git checkout <previous_commit>
docker compose up -d --build
docker compose exec router npm run db:migrate
docker compose exec router npm run smoke
```

See `docs/backup-restore.md` before any restore.

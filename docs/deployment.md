# Deployment

## 1. Prepare VPS

Install Docker and Docker Compose.

## 2. Clone Repo

```bash
git clone <repo-url>
cd iirest-router
```

## 3. Configure Env

```bash
cp .env.example .env
nano .env
```

Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `DATABASE_URL`, and public URL values.

## 4. Start Services

```bash
docker compose up -d --build
```

## 5. Run Migrations

```bash
docker compose exec router npm run db:migrate
```

## 6. Create Assistant

```bash
docker compose exec router npm run routerctl -- assistant create \
  --title "Adzhapuri Assistant" \
  --relay-account relay_adzhapuri
```

## 7. Add Telegram Webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://router.iirest.ru/webhooks/telegram/main&secret_token=<SECRET>"
```

## 8. Add User Manually

See `docs/manual-user-management.md`.

## 9. Start Mock Relay

```bash
docker compose exec router npm run mock:relay -- \
  --relay-account relay_adzhapuri \
  --token rt_...
```

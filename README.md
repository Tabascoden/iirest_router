# iirest-router

Router for Telegram/Max users to foreign OpenClaw assistants via a WebSocket relay protocol.

## Architecture

Telegram/Max -> Router -> iirest-relay/OpenClaw worker -> Router -> Telegram/Max

The router keeps real messenger identifiers only in the local database. Relay payloads use `relay_account_id`, `relay_peer_id`, `relay_sender_id`, and `event_id`.

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
npm run dev
```

## Create Assistant

```bash
npm run routerctl -- assistant create \
  --title "Adzhapuri Assistant" \
  --relay-account relay_adzhapuri
```

Save the printed `relay_token`; it is shown only once.

## Create User

```bash
npm run routerctl -- user create --title "Denis"
```

## Add Identity

```bash
npm run routerctl -- identity add \
  --user user_01J... \
  --platform telegram \
  --platform-user-id 123456789 \
  --chat-id 123456789 \
  --display-name "Denis"
```

## Grant Assistant

```bash
npm run routerctl -- user grant-assistant \
  --user user_01J... \
  --assistant asst_01J...
```

## Start Mock Relay

```bash
npm run mock:relay -- --relay-account relay_adzhapuri --token rt_...
```

## Telegram Webhook Setup

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://router.iirest.ru/webhooks/telegram/main&secret_token=<SECRET>"
```

## Checks

```bash
npm run lint
npm test
```

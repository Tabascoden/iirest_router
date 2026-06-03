# iirest-router

Production status: pilot-ready after configuring Telegram or Max, Postgres, and one foreign relay worker. Max is disabled by default.

## What It Does

`iirest-router` receives Telegram or Max messages from known users, maps them to a configured Assistant, replaces real messenger identifiers with relay aliases, sends work to a foreign OpenClaw relay worker over WebSocket, and delivers replies back to the source messenger.

Real `platform_user_id`, `chat_id`, usernames, and display names stay only in the router database.

## Architecture

```text
Telegram/Max -> Router -> relay protocol -> OpenClaw relay worker -> Router -> Telegram/Max
```

## Quick Start

```bash
npm install
cp .env.example .env
npm run build
npm test
```

For local infrastructure:

```bash
docker compose up -d postgres
npm run db:migrate
npm run dev
```

## Production Start

```bash
docker compose up -d --build
docker compose exec router npm run db:migrate
```

The router listens on `127.0.0.1:${PORT:-3000}:3000` for a reverse proxy. Postgres is exposed only inside the Docker network.

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
npm run routerctl -- identity add \
  --user user_01J... \
  --platform telegram \
  --platform-user-id 123456789 \
  --chat-id 123456789 \
  --display-name "Denis"
npm run routerctl -- user grant-assistant \
  --user user_01J... \
  --assistant asst_01J...
```

## Relay Flow

The worker connects to `/relay/stream`, sends `hello`, receives `hello.ok`, then receives queued `inbound.message` jobs. Jobs sent to relay require `ack`; if ack does not arrive before `RELAY_ACK_TIMEOUT_SECONDS`, the job is requeued until `RELAY_MAX_ATTEMPTS` is exhausted.

If `QUEUE_WHEN_RELAY_OFFLINE=true`, offline jobs stay queued and are drained automatically on relay reconnect and by periodic connected-relay drain. If it is `false`, the user gets an immediate relay-offline error. For first clients the default is `false`.

## Context Reset

`/reset` closes the active context alias and creates a new alias on the next message. Daily rotation runs once per local date in `DAILY_CONTEXT_ROTATION_TIMEZONE`. Idle reset is checked both by a background worker and directly before a new relay message is sent.

`/cancel` marks the latest active job as `cancelled`. Late worker replies for cancelled, timed-out, failed, or already answered jobs are ignored and acknowledged to the relay as ignored.

## Max Production Setup

Max routes are registered only when `MAX_ENABLED=true` or `MAX_MOCK_ENABLED=true`. For production webhook mode:

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

Register the webhook after deploying behind HTTPS on port 443:

```bash
npm run max:subscribe
npm run max:subscriptions
```

`max:subscribe` registers `${PUBLIC_BASE_URL}/webhooks/max/${MAX_WEBHOOK_BOT_KEY}` for `message_created` and `bot_started` updates. MAX sends the webhook secret in `X-Max-Bot-Api-Secret`. Replies are sent with `POST /messages?chat_id=<chatId>` and the bot token in the `Authorization` header. Leave `MAX_SEND_FORMAT` empty unless response formatting is explicitly needed.

## Dev Endpoints

`/dev/jobs`, `/dev/users`, and `/dev/relay-connections` are available only when:

```env
NODE_ENV=development
DEV_ENDPOINTS_ENABLED=true
```

`/status` is enabled by `STATUS_ENDPOINT_ENABLED=true` and returns non-PII relay/job counts for local operator checks.

## Operator CLI

Useful read-only commands:

```bash
npm run routerctl -- user list
npm run routerctl -- relay list
npm run routerctl -- jobs list --status active
npm run routerctl -- jobs show --job job_...
npm run routerctl -- context list --user user_...
```

Manual retry for failed or timed-out jobs:

```bash
npm run routerctl -- jobs retry --job job_... --reset-attempts
```

## Checks

```bash
npm run lint
npm test
npm run build
npm run smoke
```

Operational docs:

- `docs/first-client-runbook.md`
- `docs/backup-restore.md`

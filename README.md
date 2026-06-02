# iirest-router

Production status: pilot-ready after configuring Telegram, Postgres, and one foreign relay worker. Max is scaffold only and is disabled by default.

## What It Does

`iirest-router` receives Telegram messages from known users, maps them to a configured Assistant, replaces real messenger identifiers with relay aliases, sends work to a foreign OpenClaw relay worker over WebSocket, and delivers replies back to Telegram.

Real `platform_user_id`, `chat_id`, usernames, and display names stay only in the router database.

## Architecture

```text
Telegram -> Router -> relay protocol -> OpenClaw relay worker -> Router -> Telegram
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

If `QUEUE_WHEN_RELAY_OFFLINE=true`, offline jobs stay queued and are drained automatically on relay reconnect. If it is `false`, the user gets an immediate relay-offline error.

## Context Reset

`/reset` closes the active context alias and creates a new alias on the next message. Daily rotation and idle reset close active aliases; new aliases are created lazily on the next user message.

`/cancel` marks the latest active job as `cancelled`. Late worker replies for cancelled, timed-out, failed, or already answered jobs are ignored and acknowledged to the relay as ignored.

## Max Status

Max routes are registered only when `MAX_ENABLED=true` or `MAX_MOCK_ENABLED=true`. In production, `MAX_ENABLED=true` without `MAX_MOCK_ENABLED=true` fails startup because the Max sender is not production-ready.

## Dev Endpoints

`/dev/jobs`, `/dev/users`, and `/dev/relay-connections` are available only when:

```env
NODE_ENV=development
DEV_ENDPOINTS_ENABLED=true
```

## Checks

```bash
npm run lint
npm test
npm run build
npm run smoke
```

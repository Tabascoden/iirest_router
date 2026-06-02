# Relay Protocol

The relay WebSocket endpoint is `/relay/stream`.

## Auth

Client sends `hello` first:

```json
{
  "type": "hello",
  "relay_account_id": "relay_adzhapuri",
  "token": "rt_..."
}
```

Server answers:

```json
{
  "type": "hello.ok",
  "relay_account_id": "relay_adzhapuri"
}
```

After `hello.ok`, the router drains queued jobs for this relay account.

## Inbound Message to Worker

```json
{
  "type": "inbound.message",
  "event_id": "evt_01J...",
  "relay_account_id": "relay_adzhapuri",
  "peer": {
    "kind": "dm",
    "id": "peer_01J..."
  },
  "sender": {
    "id": "sender_01J...",
    "display_name": "Assistant User"
  },
  "message": {
    "id": "job_01J...",
    "text": "Show yesterday sales",
    "created_at": "2026-06-03T12:00:00.000Z"
  }
}
```

This payload must not contain `platform`, `platform_user_id`, `chat_id`, username, or a real display name.

## Ack

```json
{
  "type": "ack",
  "event_id": "evt_01J..."
}
```

If ack does not arrive before `RELAY_ACK_TIMEOUT_SECONDS`, the job returns to `queued` with exponential backoff. After `RELAY_MAX_ATTEMPTS`, it fails.

## Outbound Message from Worker

```json
{
  "type": "outbound.message",
  "event_id": "evt_01J...",
  "relay_peer_id": "peer_01J...",
  "text": "Reply text"
}
```

Server answers:

```json
{
  "type": "outbound.ack",
  "event_id": "evt_01J...",
  "status": "delivered"
}
```

Duplicate or late replies are not delivered to Telegram. The server stores them as ignored and answers:

```json
{
  "type": "outbound.ack",
  "event_id": "evt_01J...",
  "status": "ignored",
  "reason": "job_already_finalized"
}
```

Other ignored reasons include `duplicate_outbound`.

## Ping/Pong

Server sends:

```json
{
  "type": "ping",
  "ts": "2026-06-03T12:00:00.000Z"
}
```

Client answers:

```json
{
  "type": "pong",
  "ts": "2026-06-03T12:00:00.000Z"
}
```

The server also accepts client `ping` and responds with `pong`. If no `pong` arrives within `RELAY_PONG_TIMEOUT_SECONDS`, the connection is closed and unregistered.

## Errors

```json
{
  "type": "error",
  "code": "unknown_message_type",
  "message": "Unknown message type"
}
```

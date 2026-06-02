# Relay Protocol

The relay is a WebSocket endpoint at `/relay/stream`.

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

## Outbound Message from Worker

```json
{
  "type": "outbound.message",
  "event_id": "evt_01J...",
  "relay_peer_id": "peer_01J...",
  "text": "Reply text"
}
```

## Errors

```json
{
  "type": "error",
  "code": "unknown_message_type",
  "message": "Unknown message type"
}
```

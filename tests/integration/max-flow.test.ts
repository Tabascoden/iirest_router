import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { MemoryStore } from "../../src/db/memory-store.js";
import type { RelayInbound } from "../../src/relay/relay.protocol.js";
import { hashSecret } from "../../src/security/hashing.js";
import { ids } from "../../src/utils/ids.js";
import { now } from "../../src/utils/time.js";
import { CapturingSender } from "../helpers.js";

async function seedMax(store: MemoryStore) {
  const at = now();
  const user = await store.createUser({ id: "user_1", title: "Denis", status: "active", createdAt: at, updatedAt: at });
  const assistant = await store.createAssistant({
    id: "asst_1",
    title: "Adzhapuri Assistant",
    relayAccountId: "relay_adzhapuri",
    status: "active",
    createdAt: at,
    updatedAt: at
  });
  await store.createRelayAccount({
    id: ids.relayAccountRow(),
    relayAccountId: assistant.relayAccountId,
    assistantId: assistant.id,
    tokenHash: await hashSecret("rt_test"),
    status: "active",
    lastSeenAt: null,
    createdAt: at,
    updatedAt: at
  });
  await store.createIdentity({
    id: "ident_1",
    userId: user.id,
    platform: "max",
    platformUserId: "123",
    chatId: "555",
    username: "denis",
    displayName: "Denis",
    createdAt: at,
    updatedAt: at
  });
  await store.grantAssistant({ id: "ua_1", userId: user.id, assistantId: assistant.id, createdAt: at });
}

function wsOnce(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

describe("Max vertical slice", () => {
  it("routes Max webhook through relay and sends relay response back to Max", async () => {
    const snapshot = {
      TELEGRAM_ENABLED: env.TELEGRAM_ENABLED,
      MAX_ENABLED: env.MAX_ENABLED,
      MAX_WEBHOOK_SECRET: env.MAX_WEBHOOK_SECRET
    };
    env.TELEGRAM_ENABLED = false;
    env.MAX_ENABLED = true;
    env.MAX_WEBHOOK_SECRET = "correct_secret";
    const store = new MemoryStore();
    await seedMax(store);
    const sender = new CapturingSender();
    const { app } = await buildApp({ store, sender });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/relay/stream`);

    try {
      await new Promise<void>((resolve) => ws.once("open", () => resolve()));
      ws.send(JSON.stringify({ type: "hello", relay_account_id: "relay_adzhapuri", token: "rt_test" }));
      expect(await wsOnce(ws)).toMatchObject({ type: "hello.ok" });

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/max/main",
        headers: { "x-max-bot-api-secret": "correct_secret" },
        payload: {
          update_type: "message_created",
          timestamp: 1_710_000_000,
          chat_id: 555,
          user: { user_id: 123 },
          message: { mid: "mid_1", body: { text: "hello" } }
        }
      });
      expect(response.statusCode).toBe(200);

      const inbound = await wsOnce(ws) as RelayInbound;
      expect(inbound).toMatchObject({ type: "inbound.message", relay_account_id: "relay_adzhapuri" });
      expect(inbound.message.text).toBe("hello");
      ws.send(JSON.stringify({ type: "ack", event_id: inbound.event_id }));
      ws.send(JSON.stringify({ type: "outbound.message", event_id: inbound.event_id, relay_peer_id: inbound.peer.id, text: "reply" }));
      expect(await wsOnce(ws)).toMatchObject({ status: "delivered" });

      expect(sender.sent).toEqual([{ platform: "max", chatId: "555", text: "reply" }]);
      expect((await store.listJobs())[0].status).toBe("answered");
    } finally {
      env.TELEGRAM_ENABLED = snapshot.TELEGRAM_ENABLED;
      env.MAX_ENABLED = snapshot.MAX_ENABLED;
      env.MAX_WEBHOOK_SECRET = snapshot.MAX_WEBHOOK_SECRET;
      ws.close();
      await app.close();
    }
  });
});

import { describe, expect, it } from "vitest";
import { JobService } from "../../src/core/job.service.js";
import { RouterService } from "../../src/core/router.service.js";
import { MemoryStore } from "../../src/db/memory-store.js";
import { OutboundService } from "../../src/outbound/outbound.service.js";
import { RelayJobDispatcher } from "../../src/relay/relay.dispatcher.js";
import type { RelayDispatcher } from "../../src/relay/relay.types.js";
import type { RelayInbound } from "../../src/relay/relay.protocol.js";
import { hashSecret } from "../../src/security/hashing.js";
import { ids } from "../../src/utils/ids.js";
import { now } from "../../src/utils/time.js";
import { CapturingSender } from "../helpers.js";
import { env } from "../../src/config/env.js";
import { buildApp } from "../../src/app.js";
import WebSocket from "ws";

class CapturingRelay implements RelayDispatcher {
  payloads: RelayInbound[] = [];
  online = true;

  async dispatch(_relayAccountId: string, payload: RelayInbound): Promise<boolean> {
    if (!this.online) return false;
    this.payloads.push(payload);
    return true;
  }
}

async function seed(store: MemoryStore) {
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
    platform: "telegram",
    platformUserId: "123456789",
    chatId: "987654321",
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

describe("router vertical slice", () => {
  it("routes known Telegram text to relay without real platform identifiers", async () => {
    const store = new MemoryStore();
    await seed(store);
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const jobService = new JobService(store, new RelayJobDispatcher(store, relay), outbound);
    const router = new RouterService(store, outbound, jobService);

    await router.handleInbound({
      platform: "telegram",
      platformUserId: "123456789",
      chatId: "987654321",
      messageId: "42",
      username: "denis",
      displayName: "Denis",
      text: "Show yesterday sales",
      createdAt: new Date()
    });

    expect(relay.payloads).toHaveLength(1);
    expect(JSON.stringify(relay.payloads[0])).not.toContain("123456789");
    expect(JSON.stringify(relay.payloads[0])).not.toContain("987654321");
    expect(relay.payloads[0].peer.id).toMatch(/^peer_/);
    expect((await store.listJobs())[0].status).toBe("sent_to_relay");
  });

  it("does not auto-create unknown users and returns their id on /start", async () => {
    const store = new MemoryStore();
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "telegram",
      platformUserId: "111",
      chatId: "222",
      messageId: "1",
      text: "/start",
      createdAt: new Date()
    });

    expect(await store.listUsers()).toHaveLength(0);
    expect(sender.sent[0].text).toContain("telegram:111");
  });

  it("changes relay peer after /reset", async () => {
    const store = new MemoryStore();
    await seed(store);
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    const base = { platform: "telegram" as const, platformUserId: "123456789", chatId: "987654321", createdAt: new Date() };
    await router.handleInbound({ ...base, messageId: "1", text: "first" });
    const firstPeer = relay.payloads[0].peer.id;
    await store.updateJobStatus((await store.listJobs())[0].id, "answered", { answeredAt: new Date() });
    await router.handleInbound({ ...base, messageId: "2", text: "/reset" });
    await router.handleInbound({ ...base, messageId: "3", text: "second" });

    expect(relay.payloads[1].peer.id).not.toBe(firstPeer);
  });

  it("keeps offline jobs queued and drains them after reconnect", async () => {
    const previousQueue = env.QUEUE_WHEN_RELAY_OFFLINE;
    env.QUEUE_WHEN_RELAY_OFFLINE = true;
    try {
      const store = new MemoryStore();
      await seed(store);
      const sender = new CapturingSender();
      const outbound = new OutboundService(sender);
      const relay = new CapturingRelay();
      relay.online = false;
      const dispatcher = new RelayJobDispatcher(store, relay);
      const router = new RouterService(store, outbound, new JobService(store, dispatcher, outbound));

      await router.handleInbound({
        platform: "telegram",
        platformUserId: "123456789",
        chatId: "987654321",
        messageId: "42",
        text: "queued",
        createdAt: new Date()
      });

      expect((await store.listJobs())[0].status).toBe("queued");
      relay.online = true;
      await dispatcher.drainRelayQueue("relay_adzhapuri");
      expect(relay.payloads).toHaveLength(1);
      expect((await store.listJobs())[0].status).toBe("sent_to_relay");
    } finally {
      env.QUEUE_WHEN_RELAY_OFFLINE = previousQueue;
    }
  });

  it("cancels active jobs and ignores late outbound", async () => {
    const store = new MemoryStore();
    await seed(store);
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));
    const base = { platform: "telegram" as const, platformUserId: "123456789", chatId: "987654321", createdAt: new Date() };

    await router.handleInbound({ ...base, messageId: "1", text: "work" });
    await store.updateJobStatus((await store.listJobs())[0].id, "processing", { processingStartedAt: new Date() });
    await router.handleInbound({ ...base, messageId: "2", text: "/cancel" });

    expect((await store.listJobs())[0].status).toBe("cancelled");
    expect(sender.sent.some((message) => message.text === "Запрос отменен.")).toBe(true);
  });

  it("does not deliver duplicate relay outbound messages", async () => {
    const store = new MemoryStore();
    await seed(store);
    const sender = new CapturingSender();
    const at = new Date();
    await store.createJob({
      id: "job_dup",
      eventId: "evt_dup",
      assistantId: "asst_1",
      relayAccountId: "relay_adzhapuri",
      relayPeerId: "peer_dup",
      relaySenderId: "sender_dup",
      platform: "telegram",
      platformUserId: "123456789",
      chatId: "987654321",
      inboundMessageId: "1",
      text: "hello",
      status: "processing",
      error: null,
      createdAt: at,
      sentAt: at,
      answeredAt: null,
      failedAt: null,
      attempts: 1,
      lastAttemptAt: at,
      nextAttemptAt: null,
      ackDeadlineAt: null,
      processingStartedAt: at,
      cancelledAt: null
    });

    const { app } = await buildApp({ store, sender });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/relay/stream`);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    ws.send(JSON.stringify({ type: "hello", relay_account_id: "relay_adzhapuri", token: "rt_test" }));
    await wsOnce(ws);

    ws.send(JSON.stringify({ type: "outbound.message", event_id: "evt_dup", relay_peer_id: "peer_dup", text: "reply" }));
    const firstAck = await wsOnce(ws);
    ws.send(JSON.stringify({ type: "outbound.message", event_id: "evt_dup", relay_peer_id: "peer_dup", text: "reply again" }));
    const secondAck = await wsOnce(ws);

    expect(firstAck.status).toBe("delivered");
    expect(secondAck.status).toBe("ignored");
    expect(sender.sent.filter((message) => message.text.startsWith("reply"))).toHaveLength(1);
    ws.close();
    await app.close();
  });
});

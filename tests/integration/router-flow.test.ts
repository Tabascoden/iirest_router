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

async function waitFor(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
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
    expect(sender.menus).toHaveLength(1);
    expect(sender.menus[0]).toMatchObject({ platform: "telegram", chatId: "222" });
    expect(sender.sent[0].text).toContain("telegram:111");
  });

  it("sends the Max command menu on /help", async () => {
    const store = new MemoryStore();
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "max",
      platformUserId: "111",
      chatId: "222",
      messageId: "1",
      text: "/help",
      createdAt: new Date()
    });

    expect(sender.menus).toHaveLength(1);
    expect(sender.menus[0]).toMatchObject({ platform: "max", chatId: "222" });
  });

  it("sends the Max command menu on /start", async () => {
    const store = new MemoryStore();
    await seed(store);
    const at = now();
    await store.createIdentity({
      id: "ident_max_1",
      userId: "user_1",
      platform: "max",
      platformUserId: "123456789",
      chatId: "987654321",
      username: "denis",
      displayName: "Denis",
      createdAt: at,
      updatedAt: at
    });
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "max",
      platformUserId: "123456789",
      chatId: "987654321",
      messageId: "1",
      username: "denis",
      displayName: "Denis",
      text: "/start",
      createdAt: new Date()
    });

    expect(sender.menus).toHaveLength(1);
    expect(sender.menus[0]).toMatchObject({ platform: "max", chatId: "987654321" });
  });

  it("handles /restaurants as /assistants", async () => {
    const store = new MemoryStore();
    await seed(store);
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "telegram",
      platformUserId: "123456789",
      chatId: "987654321",
      messageId: "1",
      text: "/restaurants",
      createdAt: new Date()
    });

    expect(sender.sent[0].text).toContain("1. Adzhapuri Assistant");
  });

  it("handles /restaurant <n> as /assistant <n>", async () => {
    const store = new MemoryStore();
    await seed(store);
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "telegram",
      platformUserId: "123456789",
      chatId: "987654321",
      messageId: "1",
      text: "/restaurant 1",
      createdAt: new Date()
    });

    expect(await store.getActiveAssistant("telegram", "123456789", "987654321")).toMatchObject({ assistantId: "asst_1" });
    expect(sender.sent[0].text).toContain("Adzhapuri Assistant");
  });

  it("handles /id without binding", async () => {
    const store = new MemoryStore();
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "max",
      platformUserId: "111",
      chatId: "222",
      messageId: "1",
      username: "denis",
      displayName: "Denis",
      text: "/id",
      createdAt: new Date()
    });

    expect(sender.sent[0].text).toContain("platform: max");
    expect(sender.sent[0].text).toContain("platformUserId: 111");
    expect(sender.sent[0].text).toContain("chatId: 222");
    expect(sender.sent[0].text).not.toContain("relayPeerId");
    expect(sender.sent[0].text).not.toContain("token");
  });

  it("shows /admin usage without text", async () => {
    const store = new MemoryStore();
    const sender = new CapturingSender();
    const outbound = new OutboundService(sender);
    const relay = new CapturingRelay();
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "max",
      platformUserId: "111",
      chatId: "222",
      messageId: "1",
      text: "/admin",
      createdAt: new Date()
    });

    expect(sender.sent[0].text).toContain("/admin <");
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

  it("updates relay lastSeenAt on pong heartbeat", async () => {
    const store = new MemoryStore();
    await seed(store);
    const { app } = await buildApp({ store, sender: new CapturingSender() });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/relay/stream`);

    try {
      await new Promise<void>((resolve) => ws.once("open", () => resolve()));
      ws.send(JSON.stringify({ type: "hello", relay_account_id: "relay_adzhapuri", token: "rt_test" }));
      expect(await wsOnce(ws)).toMatchObject({ type: "hello.ok" });

      const afterHello = (await store.getRelayAccount("relay_adzhapuri"))?.lastSeenAt;
      expect(afterHello).toBeInstanceOf(Date);

      await new Promise((resolve) => setTimeout(resolve, 10));
      ws.send(JSON.stringify({ type: "pong", ts: new Date().toISOString() }));

      await waitFor(async () => {
        const relay = await store.getRelayAccount("relay_adzhapuri");
        return Boolean(relay?.lastSeenAt && afterHello && relay.lastSeenAt.getTime() > afterHello.getTime());
      });
    } finally {
      ws.close();
      await app.close();
    }
  });
});

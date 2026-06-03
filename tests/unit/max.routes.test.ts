import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { MemoryStore } from "../../src/db/memory-store.js";
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

async function waitForJob(store: MemoryStore) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const jobs = await store.listJobs();
    if (jobs.length > 0) return jobs;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return store.listJobs();
}

describe("Max routes", () => {
  const snapshot = {
    TELEGRAM_ENABLED: env.TELEGRAM_ENABLED,
    MAX_ENABLED: env.MAX_ENABLED,
    MAX_MOCK_ENABLED: env.MAX_MOCK_ENABLED,
    MAX_WEBHOOK_SECRET: env.MAX_WEBHOOK_SECRET,
    MAX_WEBHOOK_BOT_KEY: env.MAX_WEBHOOK_BOT_KEY
  };

  afterEach(() => {
    env.TELEGRAM_ENABLED = snapshot.TELEGRAM_ENABLED;
    env.MAX_ENABLED = snapshot.MAX_ENABLED;
    env.MAX_MOCK_ENABLED = snapshot.MAX_MOCK_ENABLED;
    env.MAX_WEBHOOK_SECRET = snapshot.MAX_WEBHOOK_SECRET;
    env.MAX_WEBHOOK_BOT_KEY = snapshot.MAX_WEBHOOK_BOT_KEY;
  });

  it("returns 401 for wrong X-Max-Bot-Api-Secret", async () => {
    env.TELEGRAM_ENABLED = false;
    env.MAX_ENABLED = true;
    env.MAX_WEBHOOK_SECRET = "correct_secret";
    const { app } = await buildApp({ store: new MemoryStore(), sender: new CapturingSender() });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/max/main",
      headers: { "x-max-bot-api-secret": "wrong_secret" },
      payload: {}
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("accepts correct secret and creates a job for message_created", async () => {
    env.TELEGRAM_ENABLED = false;
    env.MAX_ENABLED = true;
    env.MAX_WEBHOOK_SECRET = "correct_secret";
    const store = new MemoryStore();
    await seedMax(store);
    const { app } = await buildApp({ store, sender: new CapturingSender() });

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
    expect(await waitForJob(store)).toHaveLength(1);
    await app.close();
  });

  it("returns 200 without creating a job for unsupported events", async () => {
    env.TELEGRAM_ENABLED = false;
    env.MAX_ENABLED = true;
    env.MAX_WEBHOOK_SECRET = "correct_secret";
    const store = new MemoryStore();
    const sender = new CapturingSender();
    const { app } = await buildApp({ store, sender });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/max/main",
      headers: { "x-max-bot-api-secret": "correct_secret" },
      payload: {
        update_type: "message_removed",
        chat_id: 555,
        user: { user_id: 123 }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(await store.listJobs()).toHaveLength(0);
    expect(sender.sent).toHaveLength(0);
    await app.close();
  });

  it("does not register Telegram routes when TELEGRAM_ENABLED=false", async () => {
    env.TELEGRAM_ENABLED = false;
    env.MAX_ENABLED = true;
    const { app } = await buildApp({ store: new MemoryStore(), sender: new CapturingSender() });

    const response = await app.inject({ method: "POST", url: "/webhooks/telegram/main", payload: {} });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

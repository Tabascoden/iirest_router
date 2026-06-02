import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { MemoryStore } from "../../src/db/memory-store.js";
import { rotateDailyContextsIfDue } from "../../src/workers/daily-context-rotation.worker.js";

describe("daily context rotation", () => {
  it("uses configured timezone instead of container local time", async () => {
    const previousTime = env.DAILY_CONTEXT_ROTATION_TIME;
    const previousTimezone = env.DAILY_CONTEXT_ROTATION_TIMEZONE;
    env.DAILY_CONTEXT_ROTATION_TIME = "04:00";
    env.DAILY_CONTEXT_ROTATION_TIMEZONE = "Europe/Moscow";
    try {
      const store = new MemoryStore();
      await store.createAlias({
        id: "ctx_1",
        userId: "user_1",
        assistantId: "asst_1",
        relayPeerId: "peer_1",
        relaySenderId: "sender_1",
        status: "active",
        openedAt: new Date(),
        closedAt: null,
        lastMessageAt: new Date(),
        resetReason: null
      });

      expect(await rotateDailyContextsIfDue(store, new Date("2026-06-03T00:59:00.000Z"))).toBe(0);
      expect(await rotateDailyContextsIfDue(store, new Date("2026-06-03T01:00:00.000Z"))).toBe(1);
      expect(await rotateDailyContextsIfDue(store, new Date("2026-06-03T02:00:00.000Z"))).toBe(0);
    } finally {
      env.DAILY_CONTEXT_ROTATION_TIME = previousTime;
      env.DAILY_CONTEXT_ROTATION_TIMEZONE = previousTimezone;
    }
  });
});

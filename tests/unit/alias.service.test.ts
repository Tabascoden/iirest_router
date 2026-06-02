import { describe, expect, it } from "vitest";
import { AliasService } from "../../src/core/alias.service.js";
import { MemoryStore } from "../../src/db/memory-store.js";

describe("AliasService", () => {
  it("creates a new alias after reset", async () => {
    const store = new MemoryStore();
    const service = new AliasService(store);
    const first = await service.getOrCreateActive("user_1", "asst_1");
    await service.reset("user_1", "asst_1", "manual");
    const second = await service.getOrCreateActive("user_1", "asst_1");
    expect(second.relayPeerId).not.toBe(first.relayPeerId);
    expect([...store.aliases.values()].filter((alias) => alias.status === "closed")).toHaveLength(1);
  });

  it("closes idle aliases", async () => {
    const store = new MemoryStore();
    const service = new AliasService(store);
    await service.getOrCreateActive("user_1", "asst_1");
    const alias = [...store.aliases.values()][0];
    store.aliases.set(alias.id, { ...alias, lastMessageAt: new Date("2026-06-03T00:00:00.000Z") });

    const closed = await store.closeIdleAliases(new Date("2026-06-03T01:01:00.000Z"), "idle", new Date());
    expect(closed).toBe(1);
    expect([...store.aliases.values()][0].status).toBe("closed");
  });
});

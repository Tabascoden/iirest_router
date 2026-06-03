import { describe, expect, it } from "vitest";
import { AliasService } from "../../src/core/alias.service.js";
import { JobService } from "../../src/core/job.service.js";
import { RouterService } from "../../src/core/router.service.js";
import { bindIdentity, createTenant, parseResetReason, rotateRelayToken, setTenantEnabled, showRelay, showTenant, smokeTenant } from "../../src/cli/admin.js";
import { MemoryStore } from "../../src/db/memory-store.js";
import { OutboundService } from "../../src/outbound/outbound.service.js";
import { RelayJobDispatcher } from "../../src/relay/relay.dispatcher.js";
import type { RelayInbound } from "../../src/relay/relay.protocol.js";
import type { RelayDispatcher } from "../../src/relay/relay.types.js";
import { verifySecret } from "../../src/security/hashing.js";
import { now } from "../../src/utils/time.js";
import { CapturingSender } from "../helpers.js";

class CapturingRelay implements RelayDispatcher {
  payloads: RelayInbound[] = [];

  async dispatch(_relayAccountId: string, payload: RelayInbound) {
    this.payloads.push(payload);
    return true;
  }
}

describe("tenant admin helpers", () => {
  it("creates a tenant with assistant, relay account, and one-time token", async () => {
    const store = new MemoryStore();

    const result = await createTenant(store, { slug: "demo", title: "Demo Assistant" });

    expect(result.ok).toBe(true);
    expect(result.tenant.relayAccountId).toBe("relay_demo");
    expect(result.secrets.relayToken).toMatch(/^rt_/);
    expect(await store.getAssistant(result.tenant.assistantId)).toMatchObject({
      title: "Demo Assistant",
      relayAccountId: "relay_demo",
      status: "active"
    });
    const relay = await store.getRelayAccount("relay_demo");
    expect(relay?.assistantId).toBe(result.tenant.assistantId);
    expect(await verifySecret(result.secrets.relayToken, relay?.tokenHash ?? "")).toBe(true);
    await expect(createTenant(store, { slug: "demo", title: "Duplicate" })).rejects.toThrow("assistant_already_exists");
    await expect(createTenant(store, { slug: "Bad Slug", title: "Bad" })).rejects.toThrow("Invalid --slug");
  });

  it("binds an identity idempotently and refuses silent reassignment", async () => {
    const store = new MemoryStore();
    await createTenant(store, { slug: "demo", title: "Demo Assistant" });

    const first = await bindIdentity(store, {
      slug: "demo",
      userTitle: "Denis Max Test",
      platform: "max",
      platformUserId: "322777886",
      chatId: "1795651",
      displayName: "Denis Max"
    });
    const second = await bindIdentity(store, {
      slug: "demo",
      userTitle: "Ignored",
      platform: "max",
      platformUserId: "322777886",
      chatId: "1795651",
      displayName: "Denis Max"
    });

    expect(first.user.id).toBe(second.user.id);
    expect(store.users.size).toBe(1);
    expect(store.identities.size).toBe(1);
    expect(store.grants.size).toBe(1);
    expect(store.activeAssistants.size).toBe(1);

    const otherUser = await store.createUser({
      id: "user_other",
      title: "Other",
      status: "active",
      createdAt: now(),
      updatedAt: now()
    });
    await expect(bindIdentity(store, {
      slug: "demo",
      user: otherUser.id,
      platform: "max",
      platformUserId: "322777886",
      chatId: "1795651"
    })).rejects.toThrow(`identity_already_belongs_to_user:${first.user.id}`);
  });

  it("shows tenant and relay without token hashes or tokens", async () => {
    const store = new MemoryStore();
    await createTenant(store, { slug: "demo", title: "Demo Assistant" });
    await bindIdentity(store, {
      slug: "demo",
      userTitle: "Denis",
      platform: "telegram",
      platformUserId: "123",
      chatId: "456"
    });

    const tenant = await showTenant(store, { slug: "demo" });
    const relay = await showRelay(store, "relay_demo");
    const serialized = JSON.stringify({ tenant, relay });

    expect(tenant.tenant.bindings).toHaveLength(1);
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("relayToken");
  });

  it("disables tenant entities and closes active contexts", async () => {
    const store = new MemoryStore();
    const created = await createTenant(store, { slug: "demo", title: "Demo Assistant" });
    const bound = await bindIdentity(store, {
      slug: "demo",
      userTitle: "Denis",
      platform: "telegram",
      platformUserId: "123",
      chatId: "456"
    });
    await new AliasService(store).getOrCreateActive(bound.user.id, created.tenant.assistantId);

    const result = await setTenantEnabled(store, { slug: "demo", enabled: false, reason: "admin" });

    expect(result.tenant.assistantStatus).toBe("disabled");
    expect(result.tenant.relayStatus).toBe("disabled");
    expect(result.closedContexts).toBe(1);
    expect((await store.listAliasesByUser(bound.user.id))[0].status).toBe("closed");
  });

  it("does not dispatch new jobs to disabled assistants", async () => {
    const store = new MemoryStore();
    await createTenant(store, { slug: "demo", title: "Demo Assistant" });
    await bindIdentity(store, {
      slug: "demo",
      userTitle: "Denis",
      platform: "telegram",
      platformUserId: "123",
      chatId: "456"
    });
    await setTenantEnabled(store, { slug: "demo", enabled: false });
    const sender = new CapturingSender();
    const relay = new CapturingRelay();
    const outbound = new OutboundService(sender);
    const router = new RouterService(store, outbound, new JobService(store, new RelayJobDispatcher(store, relay), outbound));

    await router.handleInbound({
      platform: "telegram",
      platformUserId: "123",
      chatId: "456",
      messageId: "1",
      text: "hello",
      createdAt: now()
    });

    expect(await store.listJobs()).toHaveLength(0);
    expect(relay.payloads).toHaveLength(0);
  });

  it("rotates relay tokens and invalidates the previous token", async () => {
    const store = new MemoryStore();
    const created = await createTenant(store, { slug: "demo", title: "Demo Assistant" });
    const oldToken = created.secrets.relayToken;

    const rotated = await rotateRelayToken(store, "relay_demo");
    const relay = await store.getRelayAccount("relay_demo");

    expect(rotated.relayToken).toMatch(/^rt_/);
    expect(rotated.relayToken).not.toBe(oldToken);
    expect(await verifySecret(rotated.relayToken, relay?.tokenHash ?? "")).toBe(true);
    expect(await verifySecret(oldToken, relay?.tokenHash ?? "")).toBe(false);
  });

  it("validates reset reasons before SQL constraints", () => {
    expect(parseResetReason("admin")).toBe("admin");
    expect(() => parseResetReason("remove-test-assistant")).toThrow(
      'Invalid --reason "remove-test-assistant". Allowed values: manual, daily, idle, admin, unknown.'
    );
  });

  it("reports smoke failures as machine-readable checks", async () => {
    const store = new MemoryStore();
    await createTenant(store, { slug: "demo", title: "Demo Assistant" });

    const ok = await smokeTenant(store, { slug: "demo" });
    const broken = await smokeTenant(store, { slug: "demo", requireRelayConnected: true, maxRelayAgeSeconds: 120 });

    expect(ok.ok).toBe(true);
    expect(broken.ok).toBe(false);
    expect(broken.checks).toContainEqual(expect.objectContaining({
      name: "relay_recently_seen",
      ok: false,
      error: "relay_not_seen_recently"
    }));
  });
});

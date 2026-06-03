import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { generateRelayToken, hashSecret } from "../security/hashing.js";
import type { Assistant, Platform, RelayAccount, ResetReason } from "../types.js";
import { ids } from "../utils/ids.js";
import { now } from "../utils/time.js";

export const RESET_REASONS = ["manual", "daily", "idle", "admin", "unknown"] as const;

export function parseResetReason(value: string): ResetReason {
  if ((RESET_REASONS as readonly string[]).includes(value)) return value as ResetReason;
  throw new Error(`Invalid --reason "${value}". Allowed values: ${RESET_REASONS.join(", ")}.`);
}

export function parsePlatform(value: string): Platform {
  if (value === "max" || value === "telegram") return value;
  throw new Error(`Invalid --platform "${value}". Allowed values: max, telegram.`);
}

export function validateTenantSlug(slug: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(slug)) {
    throw new Error("Invalid --slug. Use 2-41 chars: lowercase a-z, digits, _ or -, starting with a letter or digit.");
  }
  return slug;
}

function slugFromRelayAccount(relayAccountId: string): string {
  return relayAccountId.startsWith("relay_") ? relayAccountId.slice("relay_".length) : relayAccountId;
}

function relayUrl(): string {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const wsBase = base.startsWith("https://")
    ? `wss://${base.slice("https://".length)}`
    : base.startsWith("http://")
      ? `ws://${base.slice("http://".length)}`
      : base;
  return `${wsBase}${env.RELAY_WS_PATH}`;
}

function safeRelay(account: RelayAccount | null) {
  if (!account) return null;
  return {
    relayAccountId: account.relayAccountId,
    assistantId: account.assistantId,
    status: account.status,
    lastSeenAt: account.lastSeenAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

export async function resolveTenantAssistant(
  store: RouterStore,
  options: { slug?: string; assistant?: string; relayAccount?: string }
): Promise<{ slug: string; assistant: Assistant; relayAccountId: string }> {
  let assistant: Assistant | null = null;
  let slug = options.slug ? validateTenantSlug(options.slug) : "";
  if (options.assistant) {
    assistant = await store.getAssistant(options.assistant);
  } else {
    const relayAccountId = options.relayAccount ?? `relay_${slug}`;
    assistant = await store.getAssistantByRelayAccount(relayAccountId);
  }
  if (!assistant) throw new Error("tenant_assistant_not_found");
  if (!slug) slug = slugFromRelayAccount(assistant.relayAccountId);
  return { slug, assistant, relayAccountId: assistant.relayAccountId };
}

export async function createTenant(
  store: RouterStore,
  options: { slug: string; title: string; relayAccount?: string; status?: Assistant["status"] }
) {
  const slug = validateTenantSlug(options.slug);
  const relayAccountId = options.relayAccount ?? `relay_${slug}`;
  const status = options.status ?? "active";
  if (status !== "active" && status !== "disabled") throw new Error("invalid_status");
  if (await store.getAssistantByRelayAccount(relayAccountId)) throw new Error(`assistant_already_exists_for_relay_account:${relayAccountId}`);
  if (await store.getRelayAccount(relayAccountId)) throw new Error(`relay_account_already_exists:${relayAccountId}`);

  const at = now();
  const relayToken = generateRelayToken();
  const assistant = await store.createAssistant({
    id: ids.assistant(),
    title: options.title,
    relayAccountId,
    status,
    createdAt: at,
    updatedAt: at
  });
  await store.createRelayAccount({
    id: ids.relayAccountRow(),
    relayAccountId,
    assistantId: assistant.id,
    tokenHash: await hashSecret(relayToken),
    status,
    lastSeenAt: null,
    createdAt: at,
    updatedAt: at
  });

  const routerRelayUrl = relayUrl();
  return {
    ok: true,
    tenant: {
      slug,
      assistantId: assistant.id,
      assistantTitle: assistant.title,
      relayAccountId,
      status
    },
    secrets: { relayToken },
    provisioning: {
      openclawProfile: slug,
      openclawAgentId: `openclaw/${slug}`,
      routerRelayUrl,
      relayEnv: {
        ROUTER_RELAY_URL: routerRelayUrl,
        ROUTER_RELAY_ACCOUNT_ID: relayAccountId,
        ROUTER_RELAY_TOKEN: relayToken
      }
    },
    notes: [
      "Store relayToken now; it is shown only once.",
      "OpenClaw package/source is not modified by routerctl."
    ]
  };
}

export async function showTenant(
  store: RouterStore,
  options: { slug?: string; assistant?: string; relayAccount?: string; recentJobsLimit?: number }
) {
  const tenant = await resolveTenantAssistant(store, options);
  const relay = await store.getRelayAccount(tenant.relayAccountId);
  const grants = await store.listGrantsByAssistant(tenant.assistant.id);
  const activeMappings = await store.listActiveAssistantsByAssistant(tenant.assistant.id);
  const bindings = [];
  for (const grant of grants) {
    const user = await store.getUser(grant.userId);
    const identities = await store.listIdentitiesByUser(grant.userId);
    for (const identity of identities) {
      bindings.push({
        userId: grant.userId,
        platform: identity.platform,
        platformUserId: identity.platformUserId,
        chatId: identity.chatId,
        username: identity.username,
        displayName: identity.displayName ?? user?.title ?? null,
        isActiveAssistant: activeMappings.some((active) =>
          active.platform === identity.platform &&
          active.platformUserId === identity.platformUserId &&
          active.chatId === identity.chatId
        )
      });
    }
  }

  return {
    ok: true,
    tenant: {
      slug: tenant.slug,
      assistant: {
        id: tenant.assistant.id,
        title: tenant.assistant.title,
        relayAccountId: tenant.assistant.relayAccountId,
        status: tenant.assistant.status
      },
      relay: safeRelay(relay),
      bindings,
      contexts: await store.listAliasesByAssistant(tenant.assistant.id),
      recentJobs: await store.listRecentJobsByAssistant(tenant.assistant.id, options.recentJobsLimit ?? 10)
    }
  };
}

export async function bindIdentity(
  store: RouterStore,
  options: {
    slug?: string;
    assistant?: string;
    user?: string;
    userTitle?: string;
    platform: string;
    platformUserId: string;
    chatId: string;
    username?: string;
    displayName?: string;
    setActive?: boolean;
    closeOtherContexts?: boolean;
    closeReason?: string;
  }
) {
  const tenant = await resolveTenantAssistant(store, { slug: options.slug, assistant: options.assistant });
  const platform = parsePlatform(options.platform);
  const existingIdentity = await store.getIdentity(platform, options.platformUserId);
  let userId = options.user ?? existingIdentity?.userId ?? "";
  if (options.user && existingIdentity && existingIdentity.userId !== options.user) {
    throw new Error(`identity_already_belongs_to_user:${existingIdentity.userId}`);
  }
  if (!userId) {
    if (!options.userTitle) throw new Error("Either --user or --user-title is required when identity does not exist.");
    const at = now();
    const user = await store.createUser({
      id: ids.user(),
      title: options.userTitle,
      status: "active",
      createdAt: at,
      updatedAt: at
    });
    userId = user.id;
  }

  const user = await store.getUser(userId);
  if (!user) throw new Error("user_not_found");
  const at = now();
  const identity = existingIdentity ?? await store.createIdentity({
    id: ids.identity(),
    userId,
    platform,
    platformUserId: options.platformUserId,
    chatId: options.chatId,
    username: options.username ?? null,
    displayName: options.displayName ?? null,
    createdAt: at,
    updatedAt: at
  });
  const grant = await store.grantAssistant({
    id: ids.userAssistant(),
    userId,
    assistantId: tenant.assistant.id,
    createdAt: at
  });
  const shouldSetActive = options.setActive ?? true;
  const activeAssistant = shouldSetActive
    ? await store.setActiveAssistant({
      id: ids.activeAssistant(),
      platform,
      platformUserId: options.platformUserId,
      chatId: options.chatId,
      assistantId: tenant.assistant.id,
      updatedAt: at
    })
    : null;
  const closedContexts = options.closeOtherContexts
    ? await store.closeActiveAliasesByUserExceptAssistant(userId, tenant.assistant.id, parseResetReason(options.closeReason ?? "admin"), at)
    : 0;

  return {
    ok: true,
    tenant: {
      slug: tenant.slug,
      assistantId: tenant.assistant.id,
      relayAccountId: tenant.relayAccountId
    },
    user: {
      id: user.id,
      title: user.title,
      status: user.status
    },
    identity: {
      platform: identity.platform,
      platformUserId: identity.platformUserId,
      chatId: identity.chatId,
      username: identity.username,
      displayName: identity.displayName
    },
    grant: {
      granted: Boolean(grant)
    },
    activeAssistant: {
      set: Boolean(activeAssistant),
      assistantId: activeAssistant?.assistantId ?? null
    },
    closedContexts
  };
}

export async function unbindIdentity(
  store: RouterStore,
  options: {
    slug: string;
    platform: string;
    platformUserId: string;
    chatId: string;
    revokeAssistant?: boolean;
    clearActive?: boolean;
    closeContext?: boolean;
    reason?: string;
  }
) {
  const platform = parsePlatform(options.platform);
  const identity = await store.getIdentity(platform, options.platformUserId);
  if (!identity) throw new Error("identity_not_found");
  const tenant = await resolveTenantAssistant(store, { slug: options.slug });
  const at = now();
  if (options.revokeAssistant ?? true) await store.revokeAssistant(identity.userId, tenant.assistant.id);
  let activeCleared = false;
  const active = await store.getActiveAssistant(platform, options.platformUserId, options.chatId);
  if ((options.clearActive ?? true) && active?.assistantId === tenant.assistant.id) {
    await store.deleteActiveAssistant(platform, options.platformUserId, options.chatId);
    activeCleared = true;
  }
  let closedContexts = 0;
  if (options.closeContext ?? true) {
    const activeAlias = await store.getActiveAlias(identity.userId, tenant.assistant.id);
    if (activeAlias) {
      await store.resetAlias(identity.userId, tenant.assistant.id, parseResetReason(options.reason ?? "admin"), at);
      closedContexts = 1;
    }
  }
  return {
    ok: true,
    tenant: { slug: tenant.slug, assistantId: tenant.assistant.id, relayAccountId: tenant.relayAccountId },
    identity: { platform, platformUserId: options.platformUserId, chatId: options.chatId },
    grant: { revoked: options.revokeAssistant ?? true },
    activeAssistant: { cleared: activeCleared },
    closedContexts
  };
}

export async function setTenantEnabled(store: RouterStore, options: { slug: string; enabled: boolean; reason?: string }) {
  const tenant = await resolveTenantAssistant(store, { slug: options.slug });
  const status = options.enabled ? "active" : "disabled";
  const at = now();
  const assistant = await store.updateAssistantStatus(tenant.assistant.id, status, at);
  const relay = await store.updateRelayAccountStatus(tenant.relayAccountId, status, at);
  const closedContexts = options.enabled ? 0 : await store.closeActiveAliasesByAssistant(
    tenant.assistant.id,
    parseResetReason(options.reason ?? "admin"),
    at
  );
  return {
    ok: true,
    tenant: {
      slug: tenant.slug,
      assistantId: tenant.assistant.id,
      relayAccountId: tenant.relayAccountId,
      assistantStatus: assistant?.status ?? status,
      relayStatus: relay?.status ?? status
    },
    closedContexts
  };
}

export async function showRelay(store: RouterStore, relayAccountId: string) {
  const relay = await store.getRelayAccount(relayAccountId);
  if (!relay) throw new Error("relay_account_not_found");
  const assistant = await store.getAssistant(relay.assistantId);
  return {
    ok: true,
    relay: safeRelay(relay),
    assistant: assistant ? { id: assistant.id, title: assistant.title, status: assistant.status } : null
  };
}

export async function setRelayEnabled(store: RouterStore, relayAccountId: string, enabled: boolean) {
  const relay = await store.updateRelayAccountStatus(relayAccountId, enabled ? "active" : "disabled", now());
  if (!relay) throw new Error("relay_account_not_found");
  return { ok: true, relay: safeRelay(relay) };
}

export async function rotateRelayToken(store: RouterStore, relayAccountId: string) {
  const relayToken = generateRelayToken();
  const relay = await store.updateRelayAccountTokenHash(relayAccountId, await hashSecret(relayToken), now());
  if (!relay) throw new Error("relay_account_not_found");
  return {
    ok: true,
    relayAccountId,
    relayToken,
    note: "Store this token now; it is shown only once."
  };
}

export async function setAssistantEnabled(store: RouterStore, assistantId: string, enabled: boolean) {
  const assistant = await store.updateAssistantStatus(assistantId, enabled ? "active" : "disabled", now());
  if (!assistant) throw new Error("assistant_not_found");
  return { ok: true, assistant };
}

export async function smokeTenant(
  store: RouterStore,
  options: {
    slug: string;
    requireRelayConnected?: boolean;
    maxRelayAgeSeconds?: number;
    requireBinding?: boolean;
    requireActive?: boolean;
    user?: string;
    checkJobs?: boolean;
  }
) {
  const checks: Array<Record<string, unknown> & { name: string; ok: boolean }> = [];
  const add = (name: string, ok: boolean, extra: Record<string, unknown> = {}) => checks.push({ name, ok, ...extra });
  let tenant: Awaited<ReturnType<typeof resolveTenantAssistant>> | null = null;
  try {
    tenant = await resolveTenantAssistant(store, { slug: options.slug });
    add("assistant_exists", true);
  } catch (error) {
    add("assistant_exists", false, { error: (error as Error).message });
  }
  const assistant = tenant?.assistant ?? null;
  add("assistant_active", assistant?.status === "active", assistant ? { status: assistant.status } : { error: "assistant_not_found" });
  const relay = tenant ? await store.getRelayAccount(tenant.relayAccountId) : null;
  add("relay_exists", Boolean(relay), relay ? { relayAccountId: relay.relayAccountId } : { error: "relay_not_found" });
  add("relay_active", relay?.status === "active", relay ? { status: relay.status } : { error: "relay_not_found" });

  if (options.requireRelayConnected) {
    const ageSeconds = relay?.lastSeenAt ? Math.floor((Date.now() - relay.lastSeenAt.getTime()) / 1000) : null;
    const maxAge = options.maxRelayAgeSeconds ?? 120;
    add("relay_recently_seen", ageSeconds !== null && ageSeconds <= maxAge, {
      lastSeenAt: relay?.lastSeenAt ?? null,
      ageSeconds,
      maxAgeSeconds: maxAge,
      ...(ageSeconds === null || ageSeconds > maxAge ? { error: "relay_not_seen_recently" } : {})
    });
  }
  if (assistant && options.requireBinding) {
    const grants = await store.listGrantsByAssistant(assistant.id);
    add("binding_exists", grants.length > 0, { count: grants.length, ...(grants.length === 0 ? { error: "binding_not_found" } : {}) });
  }
  if (assistant && options.requireActive) {
    const active = await store.listActiveAssistantsByAssistant(assistant.id);
    add("active_mapping_exists", active.length > 0, { count: active.length, ...(active.length === 0 ? { error: "active_mapping_not_found" } : {}) });
  }
  if (assistant && options.user) {
    const active = (await store.listAliasesByUser(options.user)).filter((alias) => alias.status === "active" && alias.assistantId !== assistant.id);
    add("no_active_contexts_on_other_assistants", active.length === 0, { count: active.length, ...(active.length ? { error: "other_active_contexts_found" } : {}) });
  }
  if (assistant && options.checkJobs) {
    const stuck = (await store.listRecentJobsByAssistant(assistant.id, 50)).filter((job) => ["queued", "sent_to_relay", "processing"].includes(job.status));
    add("no_active_jobs_stuck", stuck.length === 0, { count: stuck.length, ...(stuck.length ? { error: "active_jobs_found" } : {}) });
  }
  return { ok: checks.every((check) => check.ok), checks };
}

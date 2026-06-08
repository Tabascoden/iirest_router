#!/usr/bin/env node
import { Command } from "commander";
import { createDb, createPgPool } from "../db/client.js";
import { PostgresStore } from "../db/postgres-store.js";
import type { MaxGroupMode, MaxGroupStatus } from "../types.js";
import { ids } from "../utils/ids.js";
import { now } from "../utils/time.js";
import { parseResetReason, resolveTenantAssistant } from "./admin.js";

const MODES = ["mention_only", "all_messages", "admin_only"] as const;
const STATUSES = ["active", "disabled"] as const;

const pool = createPgPool();
const db = createDb(pool);
const store = new PostgresStore(db);
const program = new Command();

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function parseMode(value: string): MaxGroupMode {
  if ((MODES as readonly string[]).includes(value)) return value as MaxGroupMode;
  throw new Error(`Invalid --mode "${value}". Allowed values: ${MODES.join(", ")}.`);
}

function parseStatus(value: string): MaxGroupStatus {
  if ((STATUSES as readonly string[]).includes(value)) return value as MaxGroupStatus;
  throw new Error(`Invalid --status "${value}". Allowed values: ${STATUSES.join(", ")}.`);
}

async function ensureGroupUser(title: string | undefined, chatId: string) {
  const at = now();
  return store.createUser({
    id: ids.user(),
    title: title ? `Max group: ${title}` : `Max group ${chatId}`,
    status: "active",
    createdAt: at,
    updatedAt: at
  });
}

async function renderBinding(binding: Awaited<ReturnType<typeof store.getMaxGroupBinding>>) {
  if (!binding) return null;
  const assistant = await store.getAssistant(binding.assistantId);
  const user = await store.getUser(binding.userId);
  const aliases = await store.listAliasesByUser(binding.userId);
  return {
    id: binding.id,
    chatId: binding.chatId,
    title: binding.title,
    mode: binding.mode,
    status: binding.status,
    createdByPlatformUserId: binding.createdByPlatformUserId,
    assistant: assistant ? {
      id: assistant.id,
      title: assistant.title,
      relayAccountId: assistant.relayAccountId,
      status: assistant.status
    } : { id: binding.assistantId, missing: true },
    groupUser: user ? {
      id: user.id,
      title: user.title,
      status: user.status
    } : { id: binding.userId, missing: true },
    activeContexts: aliases.filter((alias) => alias.status === "active" && alias.assistantId === binding.assistantId),
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt
  };
}

program.name("max-groupctl").description("Max group chat bindings administration CLI");

program.command("bind")
  .requiredOption("--chat-id <id>")
  .option("--slug <slug>")
  .option("--assistant <assistantId>")
  .option("--title <title>")
  .option("--mode <mode>", "mention_only")
  .option("--created-by-platform-user-id <id>")
  .action(async (options) => {
    const mode = parseMode(options.mode);
    const tenant = await resolveTenantAssistant(store, { slug: options.slug, assistant: options.assistant });
    const at = now();
    const existing = await store.getMaxGroupBinding(options.chatId);
    const groupUser = existing ? await store.getUser(existing.userId) : await ensureGroupUser(options.title, options.chatId);
    if (!groupUser) throw new Error("group_user_not_found");

    await store.grantAssistant({
      id: ids.userAssistant(),
      userId: groupUser.id,
      assistantId: tenant.assistant.id,
      createdAt: at
    });

    const binding = existing
      ? await store.updateMaxGroupBinding(options.chatId, {
        assistantId: tenant.assistant.id,
        userId: groupUser.id,
        title: options.title ?? existing.title,
        mode,
        status: "active",
        createdByPlatformUserId: options.createdByPlatformUserId ?? existing.createdByPlatformUserId,
        updatedAt: at
      })
      : await store.createMaxGroupBinding({
        id: ids.maxGroupBinding(),
        chatId: options.chatId,
        assistantId: tenant.assistant.id,
        userId: groupUser.id,
        title: options.title ?? null,
        mode,
        status: "active",
        createdByPlatformUserId: options.createdByPlatformUserId ?? null,
        createdAt: at,
        updatedAt: at
      });

    print({ ok: true, tenant: { slug: tenant.slug, assistantId: tenant.assistant.id, relayAccountId: tenant.relayAccountId }, binding: await renderBinding(binding) });
  });

program.command("list")
  .option("--slug <slug>")
  .option("--assistant <assistantId>")
  .action(async (options) => {
    let rows = options.slug || options.assistant
      ? await store.listMaxGroupBindingsByAssistant((await resolveTenantAssistant(store, { slug: options.slug, assistant: options.assistant })).assistant.id)
      : await store.listMaxGroupBindings();
    const rendered = [];
    for (const row of rows) rendered.push(await renderBinding(row));
    print(rendered);
  });

program.command("show")
  .requiredOption("--chat-id <id>")
  .action(async (options) => {
    const binding = await store.getMaxGroupBinding(options.chatId);
    if (!binding) throw new Error("max_group_binding_not_found");
    print(await renderBinding(binding));
  });

program.command("set-mode")
  .requiredOption("--chat-id <id>")
  .requiredOption("--mode <mode>")
  .action(async (options) => {
    const binding = await store.updateMaxGroupBinding(options.chatId, { mode: parseMode(options.mode), updatedAt: now() });
    if (!binding) throw new Error("max_group_binding_not_found");
    print({ ok: true, binding: await renderBinding(binding) });
  });

program.command("set-status")
  .requiredOption("--chat-id <id>")
  .requiredOption("--status <status>")
  .action(async (options) => {
    const binding = await store.updateMaxGroupBinding(options.chatId, { status: parseStatus(options.status), updatedAt: now() });
    if (!binding) throw new Error("max_group_binding_not_found");
    print({ ok: true, binding: await renderBinding(binding) });
  });

program.command("unbind")
  .requiredOption("--chat-id <id>")
  .option("--close-context")
  .option("--no-close-context")
  .option("--revoke-assistant")
  .option("--no-revoke-assistant")
  .option("--reason <reason>", "admin")
  .action(async (options) => {
    const binding = await store.getMaxGroupBinding(options.chatId);
    if (!binding) throw new Error("max_group_binding_not_found");
    const reason = parseResetReason(options.reason);
    let contextClosed = false;
    if (options.closeContext ?? true) {
      const active = await store.getActiveAlias(binding.userId, binding.assistantId);
      if (active) {
        await store.resetAlias(binding.userId, binding.assistantId, reason, now());
        contextClosed = true;
      }
    }
    if (options.revokeAssistant ?? true) await store.revokeAssistant(binding.userId, binding.assistantId);
    await store.deleteMaxGroupBinding(options.chatId);
    print({ ok: true, chatId: options.chatId, deleted: true, contextClosed, grantRevoked: options.revokeAssistant ?? true });
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

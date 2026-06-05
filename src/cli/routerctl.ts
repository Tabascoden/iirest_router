#!/usr/bin/env node
import { Command } from "commander";
import { eq, or } from "drizzle-orm";
import { createDb, createPgPool } from "../db/client.js";
import { activeAssistants, assistants, contextAliases, jobs, relayAccounts, relayOutboundMessages, userAssistants } from "../db/schema.js";
import { PostgresStore } from "../db/postgres-store.js";
import { ids } from "../utils/ids.js";
import { now } from "../utils/time.js";
import { generateRelayToken, hashSecret } from "../security/hashing.js";
import type { Platform } from "../types.js";
import {
  bindIdentity,
  createTenant,
  parsePlatform,
  parseResetReason,
  rotateRelayToken,
  setAssistantEnabled,
  setRelayEnabled,
  setTenantEnabled,
  showRelay,
  showTenant,
  smokeTenant,
  unbindIdentity,
  validateTenantSlug
} from "./admin.js";

const pool = createPgPool();
const db = createDb(pool);
const store = new PostgresStore(db);
const program = new Command();

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

program.name("routerctl").description("iirest-router administration CLI");

const assistant = program.command("assistant");
assistant.command("create")
  .requiredOption("--title <title>")
  .requiredOption("--relay-account <relayAccount>")
  .action(async (options) => {
    const at = now();
    const token = generateRelayToken();
    const created = await store.createAssistant({
      id: ids.assistant(),
      title: options.title,
      relayAccountId: options.relayAccount,
      status: "active",
      createdAt: at,
      updatedAt: at
    });
    await store.createRelayAccount({
      id: ids.relayAccountRow(),
      relayAccountId: options.relayAccount,
      assistantId: created.id,
      tokenHash: await hashSecret(token),
      status: "active",
      lastSeenAt: null,
      createdAt: at,
      updatedAt: at
    });
    print({ assistant: created, relay_token: token, note: "Store this token now; it is shown only once." });
  });
assistant.command("list").action(async () => print(await store.listAssistants()));
assistant.command("show").requiredOption("--assistant <id>").action(async (options) => print(await store.getAssistant(options.assistant)));
assistant.command("disable").requiredOption("--assistant <id>").action(async (options) => print(await setAssistantEnabled(store, options.assistant, false)));
assistant.command("enable").requiredOption("--assistant <id>").action(async (options) => print(await setAssistantEnabled(store, options.assistant, true)));

const user = program.command("user");
user.command("create").requiredOption("--title <title>").action(async (options) => {
  const at = now();
  print(await store.createUser({ id: ids.user(), title: options.title, status: "active", createdAt: at, updatedAt: at }));
});
user.command("list").action(async () => print(await store.listUsers()));
user.command("show").requiredOption("--user <id>").action(async (options) => {
  const found = await store.getUser(options.user);
  const identities = await store.listIdentitiesByUser(options.user);
  const assistants = await store.listGrantedAssistants(options.user);
  print({ user: found, identities, assistants });
});
user.command("block").requiredOption("--user <id>").action(async (options) => print(await store.updateUserStatus(options.user, "blocked")));
user.command("grant-assistant").requiredOption("--user <id>").requiredOption("--assistant <id>").action(async (options) => {
  const grant = await store.grantAssistant({ id: ids.userAssistant(), userId: options.user, assistantId: options.assistant, createdAt: now() });
  const identities = await store.listIdentitiesByUser(options.user);
  const grants = await store.listGrantedAssistants(options.user);
  if (grants.length === 1) {
    for (const identity of identities) {
      await store.setActiveAssistant({
        id: ids.activeAssistant(),
        platform: identity.platform,
        platformUserId: identity.platformUserId,
        chatId: identity.chatId,
        assistantId: options.assistant,
        updatedAt: now()
      });
    }
  }
  print(grant);
});
user.command("revoke-assistant").requiredOption("--user <id>").requiredOption("--assistant <id>").action(async (options) => {
  await store.revokeAssistant(options.user, options.assistant);
  print({ ok: true });
});
user.command("set-active-assistant")
  .requiredOption("--platform <platform>")
  .requiredOption("--platform-user-id <id>")
  .requiredOption("--chat-id <id>")
  .requiredOption("--assistant <id>")
  .action(async (options) => {
    print(await store.setActiveAssistant({
      id: ids.activeAssistant(),
      platform: options.platform as Platform,
      platformUserId: options.platformUserId,
      chatId: options.chatId,
      assistantId: options.assistant,
      updatedAt: now()
    }));
  });

program.command("identity").command("add")
  .requiredOption("--user <id>")
  .requiredOption("--platform <platform>")
  .requiredOption("--platform-user-id <id>")
  .requiredOption("--chat-id <id>")
  .option("--username <username>")
  .option("--display-name <name>")
  .action(async (options) => {
    print(await store.createIdentity({
      id: ids.identity(),
      userId: options.user,
      platform: options.platform as Platform,
      platformUserId: options.platformUserId,
      chatId: options.chatId,
      username: options.username ?? null,
      displayName: options.displayName ?? null,
      createdAt: now(),
      updatedAt: now()
    }));
  });

const context = program.command("context");

context.command("reset")
  .requiredOption("--user <id>")
  .requiredOption("--assistant <id>")
  .option("--reason <reason>", "admin")
  .action(async (options) => {
    await store.resetAlias(options.user, options.assistant, parseResetReason(options.reason), now());
    print({ ok: true });
  });

context.command("list")
  .requiredOption("--user <id>")
  .action(async (options) => print(await store.listAliasesByUser(options.user)));

const relay = program.command("relay");
relay.command("list").action(async () => {
  const accounts = await store.listRelayAccounts();
  const assistantsList = await store.listAssistants();
  print(accounts.map((account) => ({
    relay_account_id: account.relayAccountId,
    assistant: assistantsList.find((assistant) => assistant.id === account.assistantId)?.title ?? account.assistantId,
    status: account.status,
    last_seen_at: account.lastSeenAt
  })));
});
relay.command("show").requiredOption("--relay <relayAccountId>").action(async (options) => print(await showRelay(store, options.relay)));
relay.command("disable").requiredOption("--relay <relayAccountId>").action(async (options) => print(await setRelayEnabled(store, options.relay, false)));
relay.command("enable").requiredOption("--relay <relayAccountId>").action(async (options) => print(await setRelayEnabled(store, options.relay, true)));
relay.command("rotate-token").requiredOption("--relay <relayAccountId>").action(async (options) => print(await rotateRelayToken(store, options.relay)));

const tenant = program.command("tenant");
tenant.command("create")
  .requiredOption("--slug <slug>")
  .requiredOption("--title <title>")
  .option("--relay-account <relayAccount>")
  .option("--status <status>", "active")
  .option("--json")
  .action(async (options) => {
    print(await createTenant(store, {
      slug: options.slug,
      title: options.title,
      relayAccount: options.relayAccount,
      status: options.status
    }));
  });
tenant.command("show")
  .option("--slug <slug>")
  .option("--assistant <assistantId>")
  .option("--relay-account <relayAccountId>")
  .action(async (options) => {
    print(await showTenant(store, {
      slug: options.slug,
      assistant: options.assistant,
      relayAccount: options.relayAccount
    }));
  });
tenant.command("update-title")
  .requiredOption("--slug <slug>")
  .requiredOption("--title <title>")
  .action(async (options) => {
    const slug = validateTenantSlug(options.slug);
    const found = await store.getAssistantByRelayAccount(`relay_${slug}`);
    if (!found) throw new Error("tenant_assistant_not_found");
    const rows = await db.update(assistants)
      .set({ title: options.title, updatedAt: now() })
      .where(eq(assistants.id, found.id))
      .returning();
    print({
      ok: true,
      tenant: {
        slug,
        assistantId: found.id,
        relayAccountId: found.relayAccountId,
        previousTitle: found.title,
        title: rows[0]?.title ?? options.title
      }
    });
  });
tenant.command("delete")
  .requiredOption("--slug <slug>")
  .requiredOption("--confirm <slug>")
  .option("--dry-run")
  .action(async (options) => {
    const slug = validateTenantSlug(options.slug);
    if (options.confirm !== slug) throw new Error(`confirmation_mismatch: expected --confirm ${slug}`);
    const found = await store.getAssistantByRelayAccount(`relay_${slug}`);
    if (!found) throw new Error("tenant_assistant_not_found");
    const assistantId = found.id;
    const relayAccountId = found.relayAccountId;
    const summary = {
      relayOutboundMessages: (await db.select().from(relayOutboundMessages).where(eq(relayOutboundMessages.relayAccountId, relayAccountId))).length,
      jobs: (await db.select().from(jobs).where(or(eq(jobs.assistantId, assistantId), eq(jobs.relayAccountId, relayAccountId)))).length,
      contextAliases: (await db.select().from(contextAliases).where(eq(contextAliases.assistantId, assistantId))).length,
      activeAssistants: (await db.select().from(activeAssistants).where(eq(activeAssistants.assistantId, assistantId))).length,
      userAssistants: (await db.select().from(userAssistants).where(eq(userAssistants.assistantId, assistantId))).length,
      relayAccounts: (await db.select().from(relayAccounts).where(eq(relayAccounts.relayAccountId, relayAccountId))).length,
      assistants: 1
    };
    if (options.dryRun) {
      print({ ok: true, dryRun: true, tenant: { slug, assistantId, relayAccountId, title: found.title }, wouldDelete: summary });
      return;
    }
    const deleted = {
      relayOutboundMessages: (await db.delete(relayOutboundMessages).where(eq(relayOutboundMessages.relayAccountId, relayAccountId)).returning()).length,
      jobs: (await db.delete(jobs).where(or(eq(jobs.assistantId, assistantId), eq(jobs.relayAccountId, relayAccountId))).returning()).length,
      contextAliases: (await db.delete(contextAliases).where(eq(contextAliases.assistantId, assistantId)).returning()).length,
      activeAssistants: (await db.delete(activeAssistants).where(eq(activeAssistants.assistantId, assistantId)).returning()).length,
      userAssistants: (await db.delete(userAssistants).where(eq(userAssistants.assistantId, assistantId)).returning()).length,
      relayAccounts: (await db.delete(relayAccounts).where(eq(relayAccounts.relayAccountId, relayAccountId)).returning()).length,
      assistants: (await db.delete(assistants).where(eq(assistants.id, assistantId)).returning()).length
    };
    print({ ok: true, tenant: { slug, assistantId, relayAccountId, title: found.title }, deleted });
  });
tenant.command("bind-identity")
  .option("--slug <slug>")
  .option("--assistant <assistantId>")
  .option("--user <userId>")
  .option("--user-title <title>")
  .requiredOption("--platform <platform>")
  .requiredOption("--platform-user-id <id>")
  .requiredOption("--chat-id <id>")
  .option("--username <username>")
  .option("--display-name <name>")
  .option("--set-active")
  .option("--no-set-active")
  .option("--close-other-contexts")
  .option("--close-reason <reason>", "admin")
  .action(async (options) => {
    print(await bindIdentity(store, {
      slug: options.slug,
      assistant: options.assistant,
      user: options.user,
      userTitle: options.userTitle,
      platform: parsePlatform(options.platform),
      platformUserId: options.platformUserId,
      chatId: options.chatId,
      username: options.username,
      displayName: options.displayName,
      setActive: options.setActive,
      closeOtherContexts: Boolean(options.closeOtherContexts),
      closeReason: options.closeReason
    }));
  });
tenant.command("unbind-identity")
  .requiredOption("--slug <slug>")
  .requiredOption("--platform <platform>")
  .requiredOption("--platform-user-id <id>")
  .requiredOption("--chat-id <id>")
  .option("--revoke-assistant")
  .option("--no-revoke-assistant")
  .option("--clear-active")
  .option("--no-clear-active")
  .option("--close-context")
  .option("--no-close-context")
  .option("--reason <reason>", "admin")
  .action(async (options) => {
    print(await unbindIdentity(store, {
      slug: options.slug,
      platform: parsePlatform(options.platform),
      platformUserId: options.platformUserId,
      chatId: options.chatId,
      revokeAssistant: options.revokeAssistant,
      clearActive: options.clearActive,
      closeContext: options.closeContext,
      reason: options.reason
    }));
  });
tenant.command("disable")
  .requiredOption("--slug <slug>")
  .option("--reason <reason>", "admin")
  .action(async (options) => print(await setTenantEnabled(store, { slug: options.slug, enabled: false, reason: options.reason })));
tenant.command("enable")
  .requiredOption("--slug <slug>")
  .action(async (options) => print(await setTenantEnabled(store, { slug: options.slug, enabled: true })));
tenant.command("smoke")
  .requiredOption("--slug <slug>")
  .option("--require-relay-connected")
  .option("--max-relay-age-seconds <seconds>")
  .option("--require-binding")
  .option("--require-active")
  .option("--user <userId>")
  .option("--check-jobs")
  .action(async (options) => {
    const result = await smokeTenant(store, {
      slug: options.slug,
      requireRelayConnected: Boolean(options.requireRelayConnected),
      maxRelayAgeSeconds: options.maxRelayAgeSeconds ? Number(options.maxRelayAgeSeconds) : undefined,
      requireBinding: Boolean(options.requireBinding),
      requireActive: Boolean(options.requireActive),
      user: options.user,
      checkJobs: Boolean(options.checkJobs)
    });
    print(result);
    if (!result.ok) process.exitCode = 1;
  });

const jobsCommand = program.command("jobs");
jobsCommand.command("list")
  .option("--status <status>")
  .option("--relay <relayAccountId>")
  .option("--user <userId>")
  .action(async (options) => {
    let rows = await store.listJobs();
    if (options.status === "active") {
      rows = rows.filter((job) => ["queued", "sent_to_relay", "processing"].includes(job.status));
    } else if (options.status) {
      rows = rows.filter((job) => job.status === options.status);
    }
    if (options.relay) rows = rows.filter((job) => job.relayAccountId === options.relay);
    if (options.user) {
      const identities = await store.listIdentitiesByUser(options.user);
      const keys = new Set(identities.map((identity) => `${identity.platform}:${identity.platformUserId}`));
      rows = rows.filter((job) => keys.has(`${job.platform}:${job.platformUserId}`));
    }
    print(rows);
  });
jobsCommand.command("show")
  .requiredOption("--job <id>")
  .action(async (options) => print(await store.getJob(options.job)));
jobsCommand.command("retry")
  .requiredOption("--job <id>")
  .option("--reset-attempts")
  .action(async (options) => {
    const job = await store.getJob(options.job);
    if (!job) throw new Error("job_not_found");
    if (!["failed", "timeout"].includes(job.status)) throw new Error("only_failed_or_timeout_jobs_can_be_retried");
    const updated = await store.updateJobStatus(job.id, "queued", {
      error: null,
      nextAttemptAt: now(),
      failedAt: null,
      ackDeadlineAt: null,
      attempts: options.resetAttempts ? 0 : job.attempts
    });
    print(updated);
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

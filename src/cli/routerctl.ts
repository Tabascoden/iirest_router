#!/usr/bin/env node
import { Command } from "commander";
import { createDb, createPgPool } from "../db/client.js";
import { PostgresStore } from "../db/postgres-store.js";
import { ids } from "../utils/ids.js";
import { now } from "../utils/time.js";
import { generateRelayToken, hashSecret } from "../security/hashing.js";
import type { Platform, ResetReason } from "../types.js";

const pool = createPgPool();
const store = new PostgresStore(createDb(pool));
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
    await store.resetAlias(options.user, options.assistant, options.reason as ResetReason, now());
    print({ ok: true });
  });

context.command("list")
  .requiredOption("--user <id>")
  .action(async (options) => print(await store.listAliasesByUser(options.user)));

const relay = program.command("relay");
relay.command("list").action(async () => {
  const accounts = await store.listRelayAccounts();
  const assistants = await store.listAssistants();
  print(accounts.map((account) => ({
    relay_account_id: account.relayAccountId,
    assistant: assistants.find((assistant) => assistant.id === account.assistantId)?.title ?? account.assistantId,
    status: account.status,
    last_seen_at: account.lastSeenAt
  })));
});

const jobs = program.command("jobs");
jobs.command("list")
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
jobs.command("show")
  .requiredOption("--job <id>")
  .action(async (options) => print(await store.getJob(options.job)));
jobs.command("retry")
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
} finally {
  await pool.end();
}

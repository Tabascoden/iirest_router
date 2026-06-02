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

program.command("context").command("reset")
  .requiredOption("--user <id>")
  .requiredOption("--assistant <id>")
  .option("--reason <reason>", "admin")
  .action(async (options) => {
    await store.resetAlias(options.user, options.assistant, options.reason as ResetReason, now());
    print({ ok: true });
  });

try {
  await program.parseAsync();
} finally {
  await pool.end();
}

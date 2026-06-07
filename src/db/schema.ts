import { integer, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const identities = pgTable(
  "identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    platform: text("platform").notNull(),
    platformUserId: text("platform_user_id").notNull(),
    chatId: text("chat_id").notNull(),
    username: text("username"),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    platformUserUnique: uniqueIndex("identities_platform_user_unique").on(table.platform, table.platformUserId),
    userIdx: index("identities_user_id_idx").on(table.userId)
  })
);

export const assistants = pgTable(
  "assistants",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    relayAccountId: text("relay_account_id").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    relayAccountUnique: uniqueIndex("assistants_relay_account_id_unique").on(table.relayAccountId)
  })
);

export const userAssistants = pgTable(
  "user_assistants",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    assistantId: text("assistant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    grantUnique: uniqueIndex("user_assistants_user_assistant_unique").on(table.userId, table.assistantId)
  })
);

export const activeAssistants = pgTable(
  "active_assistants",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    platformUserId: text("platform_user_id").notNull(),
    chatId: text("chat_id").notNull(),
    assistantId: text("assistant_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    activeUnique: uniqueIndex("active_assistants_platform_chat_unique").on(
      table.platform,
      table.platformUserId,
      table.chatId
    )
  })
);

export const contextAliases = pgTable(
  "context_aliases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    assistantId: text("assistant_id").notNull(),
    relayPeerId: text("relay_peer_id").notNull(),
    relaySenderId: text("relay_sender_id").notNull(),
    status: text("status").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    resetReason: text("reset_reason")
  },
  (table) => ({
    relayPeerUnique: uniqueIndex("context_aliases_relay_peer_unique").on(table.assistantId, table.relayPeerId),
    activeIdx: index("context_aliases_active_idx").on(table.userId, table.assistantId, table.status)
  })
);

export const relayAccounts = pgTable(
  "relay_accounts",
  {
    id: text("id").primaryKey(),
    relayAccountId: text("relay_account_id").notNull(),
    assistantId: text("assistant_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    relayAccountUnique: uniqueIndex("relay_accounts_relay_account_id_unique").on(table.relayAccountId),
    assistantUnique: uniqueIndex("relay_accounts_assistant_id_unique").on(table.assistantId)
  })
);

export const maxGroupBindings = pgTable(
  "max_group_bindings",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull(),
    assistantId: text("assistant_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title"),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    createdByPlatformUserId: text("created_by_platform_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    chatUnique: uniqueIndex("max_group_bindings_chat_unique").on(table.chatId),
    assistantIdx: index("max_group_bindings_assistant_idx").on(table.assistantId),
    userIdx: index("max_group_bindings_user_idx").on(table.userId)
  })
);

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  assistantId: text("assistant_id").notNull(),
  relayAccountId: text("relay_account_id").notNull(),
  relayPeerId: text("relay_peer_id").notNull(),
  relaySenderId: text("relay_sender_id").notNull(),
  platform: text("platform").notNull(),
  platformUserId: text("platform_user_id").notNull(),
  chatId: text("chat_id").notNull(),
  inboundMessageId: text("inbound_message_id").notNull(),
  text: text("text").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  ackDeadlineAt: timestamp("ack_deadline_at", { withTimezone: true }),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true })
});

export const relayOutboundMessages = pgTable("relay_outbound_messages", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  jobId: text("job_id").notNull(),
  relayAccountId: text("relay_account_id").notNull(),
  relayPeerId: text("relay_peer_id").notNull(),
  text: text("text").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true })
});

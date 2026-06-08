import { and, desc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type {
  ActiveAssistant,
  Assistant,
  ContextAlias,
  Identity,
  Job,
  JobStatus,
  MaxGroupBinding,
  Platform,
  RelayAccount,
  RelayOutboundMessage,
  ResetReason,
  User,
  UserAssistant
} from "../types.js";
import type { Db } from "./client.js";
import type { RouterStore } from "./store.js";
import {
  activeAssistants,
  assistants,
  contextAliases,
  identities,
  jobs,
  maxGroupBindings,
  relayAccounts,
  relayOutboundMessages,
  userAssistants,
  users
} from "./schema.js";

function first<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export class PostgresStore implements RouterStore {
  constructor(private readonly db: Db) {}

  async createUser(input: User) { return first(await this.db.insert(users).values(input).returning())! as User; }
  async getUser(id: string) { return first(await this.db.select().from(users).where(eq(users.id, id))) as User | null; }
  async listUsers() { return (await this.db.select().from(users)) as User[]; }
  async updateUserStatus(id: string, status: User["status"]) {
    return first(await this.db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id)).returning()) as User | null;
  }

  async createAssistant(input: Assistant) { return first(await this.db.insert(assistants).values(input).returning())! as Assistant; }
  async getAssistant(id: string) { return first(await this.db.select().from(assistants).where(eq(assistants.id, id))) as Assistant | null; }
  async getAssistantByRelayAccount(relayAccountId: string) {
    return first(await this.db.select().from(assistants).where(eq(assistants.relayAccountId, relayAccountId))) as Assistant | null;
  }
  async listAssistants() { return (await this.db.select().from(assistants)) as Assistant[]; }
  async updateAssistantStatus(id: string, status: Assistant["status"], at: Date) {
    return first(await this.db.update(assistants).set({ status, updatedAt: at }).where(eq(assistants.id, id)).returning()) as Assistant | null;
  }

  async createRelayAccount(input: RelayAccount) { return first(await this.db.insert(relayAccounts).values(input).returning())! as RelayAccount; }
  async getRelayAccount(relayAccountId: string) {
    return first(await this.db.select().from(relayAccounts).where(eq(relayAccounts.relayAccountId, relayAccountId))) as RelayAccount | null;
  }
  async listRelayAccounts() {
    return (await this.db.select().from(relayAccounts)) as RelayAccount[];
  }
  async touchRelayAccount(relayAccountId: string, at: Date) {
    await this.db.update(relayAccounts).set({ lastSeenAt: at, updatedAt: at }).where(eq(relayAccounts.relayAccountId, relayAccountId));
  }
  async updateRelayAccountStatus(relayAccountId: string, status: RelayAccount["status"], at: Date) {
    return first(await this.db.update(relayAccounts)
      .set({ status, updatedAt: at })
      .where(eq(relayAccounts.relayAccountId, relayAccountId))
      .returning()) as RelayAccount | null;
  }
  async updateRelayAccountTokenHash(relayAccountId: string, tokenHash: string, at: Date) {
    return first(await this.db.update(relayAccounts)
      .set({ tokenHash, updatedAt: at })
      .where(eq(relayAccounts.relayAccountId, relayAccountId))
      .returning()) as RelayAccount | null;
  }

  async createIdentity(input: Identity) { return first(await this.db.insert(identities).values(input).returning())! as Identity; }
  async getIdentity(platform: Platform, platformUserId: string) {
    return first(await this.db.select().from(identities).where(and(eq(identities.platform, platform), eq(identities.platformUserId, platformUserId)))) as Identity | null;
  }
  async listIdentitiesByUser(userId: string) {
    return (await this.db.select().from(identities).where(eq(identities.userId, userId))) as Identity[];
  }

  async grantAssistant(input: UserAssistant) {
    const existing = await this.db.select().from(userAssistants).where(and(eq(userAssistants.userId, input.userId), eq(userAssistants.assistantId, input.assistantId)));
    if (existing[0]) return existing[0] as UserAssistant;
    return first(await this.db.insert(userAssistants).values(input).returning())! as UserAssistant;
  }
  async revokeAssistant(userId: string, assistantId: string) {
    await this.db.delete(userAssistants).where(and(eq(userAssistants.userId, userId), eq(userAssistants.assistantId, assistantId)));
  }
  async listGrantedAssistants(userId: string) {
    const grants = await this.db.select().from(userAssistants).where(eq(userAssistants.userId, userId));
    const assistantIds = grants.map((grant) => grant.assistantId);
    if (assistantIds.length === 0) return [];
    return (await this.db.select().from(assistants).where(inArray(assistants.id, assistantIds))) as Assistant[];
  }
  async listGrantsByAssistant(assistantId: string) {
    return (await this.db.select().from(userAssistants).where(eq(userAssistants.assistantId, assistantId))) as UserAssistant[];
  }

  async getActiveAssistant(platform: Platform, platformUserId: string, chatId: string) {
    return first(await this.db.select().from(activeAssistants).where(and(
      eq(activeAssistants.platform, platform),
      eq(activeAssistants.platformUserId, platformUserId),
      eq(activeAssistants.chatId, chatId)
    ))) as ActiveAssistant | null;
  }
  async setActiveAssistant(input: ActiveAssistant) {
    const existing = await this.getActiveAssistant(input.platform, input.platformUserId, input.chatId);
    if (existing) {
      return first(await this.db.update(activeAssistants).set({ assistantId: input.assistantId, updatedAt: input.updatedAt }).where(eq(activeAssistants.id, existing.id)).returning())! as ActiveAssistant;
    }
    return first(await this.db.insert(activeAssistants).values(input).returning())! as ActiveAssistant;
  }
  async deleteActiveAssistant(platform: Platform, platformUserId: string, chatId: string) {
    await this.db.delete(activeAssistants).where(and(
      eq(activeAssistants.platform, platform),
      eq(activeAssistants.platformUserId, platformUserId),
      eq(activeAssistants.chatId, chatId)
    ));
  }
  async listActiveAssistantsByAssistant(assistantId: string) {
    return (await this.db.select().from(activeAssistants).where(eq(activeAssistants.assistantId, assistantId))) as ActiveAssistant[];
  }

  async getActiveAlias(userId: string, assistantId: string) {
    return first(await this.db.select().from(contextAliases).where(and(
      eq(contextAliases.userId, userId),
      eq(contextAliases.assistantId, assistantId),
      eq(contextAliases.status, "active")
    ))) as ContextAlias | null;
  }
  async listAliasesByUser(userId: string) {
    return (await this.db.select().from(contextAliases).where(eq(contextAliases.userId, userId))) as ContextAlias[];
  }
  async listAliasesByAssistant(assistantId: string) {
    return (await this.db.select().from(contextAliases).where(eq(contextAliases.assistantId, assistantId))) as ContextAlias[];
  }
  async createAlias(input: ContextAlias) { return first(await this.db.insert(contextAliases).values(input).returning())! as ContextAlias; }
  async touchAlias(id: string, at: Date) {
    await this.db.update(contextAliases).set({ lastMessageAt: at }).where(eq(contextAliases.id, id));
  }
  async resetAlias(userId: string, assistantId: string, reason: ResetReason, at: Date) {
    await this.db.update(contextAliases).set({ status: "closed", closedAt: at, resetReason: reason }).where(and(
      eq(contextAliases.userId, userId),
      eq(contextAliases.assistantId, assistantId),
      eq(contextAliases.status, "active")
    ));
  }
  async closeAllActiveAliases(reason: ResetReason, at: Date) {
    const rows = await this.db.update(contextAliases).set({ status: "closed", closedAt: at, resetReason: reason }).where(eq(contextAliases.status, "active")).returning();
    return rows.length;
  }
  async closeIdleAliases(before: Date, reason: ResetReason, at: Date) {
    const rows = await this.db.update(contextAliases)
      .set({ status: "closed", closedAt: at, resetReason: reason })
      .where(and(eq(contextAliases.status, "active"), lt(contextAliases.lastMessageAt, before)))
      .returning();
    return rows.length;
  }
  async closeActiveAliasesByAssistant(assistantId: string, reason: ResetReason, at: Date) {
    const rows = await this.db.update(contextAliases)
      .set({ status: "closed", closedAt: at, resetReason: reason })
      .where(and(eq(contextAliases.assistantId, assistantId), eq(contextAliases.status, "active")))
      .returning();
    return rows.length;
  }
  async closeActiveAliasesByUserExceptAssistant(userId: string, keepAssistantId: string, reason: ResetReason, at: Date) {
    const aliases = await this.db.select().from(contextAliases).where(and(
      eq(contextAliases.userId, userId),
      eq(contextAliases.status, "active")
    ));
    const idsToClose = aliases.filter((alias) => alias.assistantId !== keepAssistantId).map((alias) => alias.id);
    if (idsToClose.length === 0) return 0;
    const rows = await this.db.update(contextAliases)
      .set({ status: "closed", closedAt: at, resetReason: reason })
      .where(inArray(contextAliases.id, idsToClose))
      .returning();
    return rows.length;
  }

  async createMaxGroupBinding(input: MaxGroupBinding) {
    return first(await this.db.insert(maxGroupBindings).values(input).returning())! as MaxGroupBinding;
  }
  async getMaxGroupBinding(chatId: string) {
    return first(await this.db.select().from(maxGroupBindings).where(eq(maxGroupBindings.chatId, chatId))) as MaxGroupBinding | null;
  }
  async listMaxGroupBindings() {
    return (await this.db.select().from(maxGroupBindings).orderBy(desc(maxGroupBindings.updatedAt))) as MaxGroupBinding[];
  }
  async listMaxGroupBindingsByAssistant(assistantId: string) {
    return (await this.db.select().from(maxGroupBindings).where(eq(maxGroupBindings.assistantId, assistantId)).orderBy(desc(maxGroupBindings.updatedAt))) as MaxGroupBinding[];
  }
  async updateMaxGroupBinding(chatId: string, fields: Partial<Pick<MaxGroupBinding, "assistantId" | "userId" | "title" | "mode" | "status" | "createdByPlatformUserId" | "updatedAt">>) {
    return first(await this.db.update(maxGroupBindings).set(fields).where(eq(maxGroupBindings.chatId, chatId)).returning()) as MaxGroupBinding | null;
  }
  async deleteMaxGroupBinding(chatId: string) {
    await this.db.delete(maxGroupBindings).where(eq(maxGroupBindings.chatId, chatId));
  }

  async createJob(input: Job) { return first(await this.db.insert(jobs).values(input).returning())! as Job; }
  async getJob(id: string) { return first(await this.db.select().from(jobs).where(eq(jobs.id, id))) as Job | null; }
  async getJobByEventId(eventId: string) {
    return first(await this.db.select().from(jobs).where(eq(jobs.eventId, eventId))) as Job | null;
  }
  async listJobs() { return (await this.db.select().from(jobs)) as Job[]; }
  async listQueuedJobsForRelay(relayAccountId: string, at: Date, limit: number) {
    const relay = await this.getRelayAccount(relayAccountId);
    if (!relay || relay.status !== "active") return [];
    const assistant = await this.getAssistant(relay.assistantId);
    if (!assistant || assistant.status !== "active") return [];
    return (await this.db.select().from(jobs).where(and(
      eq(jobs.relayAccountId, relayAccountId),
      eq(jobs.status, "queued"),
      or(isNull(jobs.nextAttemptAt), lte(jobs.nextAttemptAt, at))
    )).orderBy(jobs.createdAt).limit(limit)) as Job[];
  }
  async listJobsPastAckDeadline(at: Date) {
    return (await this.db.select().from(jobs).where(and(
      eq(jobs.status, "sent_to_relay"),
      lt(jobs.ackDeadlineAt, at)
    ))) as Job[];
  }
  async listActiveJobsOlderThan(before: Date) {
    return (await this.db.select().from(jobs).where(and(
      inArray(jobs.status, ["queued", "sent_to_relay", "processing"]),
      lt(jobs.createdAt, before)
    ))) as Job[];
  }
  async countActiveJobsForUser(platform: Platform, platformUserId: string) {
    const rows = await this.db.select().from(jobs).where(and(
      eq(jobs.platform, platform),
      eq(jobs.platformUserId, platformUserId),
      inArray(jobs.status, ["queued", "sent_to_relay", "processing"])
    ));
    return rows.length;
  }
  async countActiveJobsForAssistant(assistantId: string) {
    const rows = await this.db.select().from(jobs).where(and(
      eq(jobs.assistantId, assistantId),
      inArray(jobs.status, ["queued", "sent_to_relay", "processing"])
    ));
    return rows.length;
  }
  async findLatestActiveJobForUser(platform: Platform, platformUserId: string) {
    return first(await this.db.select().from(jobs).where(and(
      eq(jobs.platform, platform),
      eq(jobs.platformUserId, platformUserId),
      inArray(jobs.status, ["queued", "sent_to_relay", "processing"])
    )).orderBy(desc(jobs.createdAt)).limit(1)) as Job | null;
  }
  async listRecentJobsByAssistant(assistantId: string, limit: number) {
    return (await this.db.select().from(jobs)
      .where(eq(jobs.assistantId, assistantId))
      .orderBy(desc(jobs.createdAt))
      .limit(limit)) as Job[];
  }
  async updateJobStatus(id: string, status: JobStatus, fields: Partial<Job> = {}) {
    return first(await this.db.update(jobs).set({ ...fields, status }).where(eq(jobs.id, id)).returning()) as Job | null;
  }
  async cancelJob(id: string, reason: string, at: Date) {
    return this.updateJobStatus(id, "cancelled", { error: reason, cancelledAt: at });
  }

  async createRelayOutbound(input: RelayOutboundMessage) {
    return first(await this.db.insert(relayOutboundMessages).values(input).returning())! as RelayOutboundMessage;
  }
  async hasDeliveredRelayOutbound(eventId: string) {
    const rows = await this.db.select().from(relayOutboundMessages).where(and(
      eq(relayOutboundMessages.eventId, eventId),
      eq(relayOutboundMessages.status, "delivered")
    )).limit(1);
    return rows.length > 0;
  }
  async updateRelayOutboundStatus(id: string, status: RelayOutboundMessage["status"], fields: Partial<RelayOutboundMessage> = {}) {
    await this.db.update(relayOutboundMessages).set({ ...fields, status }).where(eq(relayOutboundMessages.id, id));
  }
}

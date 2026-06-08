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
import type { RouterStore } from "./store.js";

export class MemoryStore implements RouterStore {
  users = new Map<string, User>();
  identities = new Map<string, Identity>();
  assistants = new Map<string, Assistant>();
  grants = new Map<string, UserAssistant>();
  activeAssistants = new Map<string, ActiveAssistant>();
  aliases = new Map<string, ContextAlias>();
  relayAccounts = new Map<string, RelayAccount>();
  maxGroupBindings = new Map<string, MaxGroupBinding>();
  jobs = new Map<string, Job>();
  outbound = new Map<string, RelayOutboundMessage>();

  async createUser(input: User) { this.users.set(input.id, input); return input; }
  async getUser(id: string) { return this.users.get(id) ?? null; }
  async listUsers() { return [...this.users.values()]; }
  async updateUserStatus(id: string, status: User["status"]) {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, status, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async createAssistant(input: Assistant) { this.assistants.set(input.id, input); return input; }
  async getAssistant(id: string) { return this.assistants.get(id) ?? null; }
  async getAssistantByRelayAccount(relayAccountId: string) {
    return [...this.assistants.values()].find((assistant) => assistant.relayAccountId === relayAccountId) ?? null;
  }
  async listAssistants() { return [...this.assistants.values()]; }
  async updateAssistantStatus(id: string, status: Assistant["status"], at: Date) {
    const assistant = this.assistants.get(id);
    if (!assistant) return null;
    const updated = { ...assistant, status, updatedAt: at };
    this.assistants.set(id, updated);
    return updated;
  }

  async createRelayAccount(input: RelayAccount) { this.relayAccounts.set(input.relayAccountId, input); return input; }
  async getRelayAccount(relayAccountId: string) { return this.relayAccounts.get(relayAccountId) ?? null; }
  async listRelayAccounts() { return [...this.relayAccounts.values()]; }
  async touchRelayAccount(relayAccountId: string, at: Date) {
    const account = this.relayAccounts.get(relayAccountId);
    if (account) this.relayAccounts.set(relayAccountId, { ...account, lastSeenAt: at, updatedAt: at });
  }
  async updateRelayAccountStatus(relayAccountId: string, status: RelayAccount["status"], at: Date) {
    const account = this.relayAccounts.get(relayAccountId);
    if (!account) return null;
    const updated = { ...account, status, updatedAt: at };
    this.relayAccounts.set(relayAccountId, updated);
    return updated;
  }
  async updateRelayAccountTokenHash(relayAccountId: string, tokenHash: string, at: Date) {
    const account = this.relayAccounts.get(relayAccountId);
    if (!account) return null;
    const updated = { ...account, tokenHash, updatedAt: at };
    this.relayAccounts.set(relayAccountId, updated);
    return updated;
  }

  async createIdentity(input: Identity) { this.identities.set(`${input.platform}:${input.platformUserId}`, input); return input; }
  async getIdentity(platform: Platform, platformUserId: string) { return this.identities.get(`${platform}:${platformUserId}`) ?? null; }
  async listIdentitiesByUser(userId: string) { return [...this.identities.values()].filter((identity) => identity.userId === userId); }

  async grantAssistant(input: UserAssistant) { this.grants.set(`${input.userId}:${input.assistantId}`, input); return input; }
  async revokeAssistant(userId: string, assistantId: string) { this.grants.delete(`${userId}:${assistantId}`); }
  async listGrantedAssistants(userId: string) {
    const assistantIds = [...this.grants.values()].filter((grant) => grant.userId === userId).map((grant) => grant.assistantId);
    return assistantIds.map((id) => this.assistants.get(id)).filter((assistant): assistant is Assistant => Boolean(assistant));
  }
  async listGrantsByAssistant(assistantId: string) {
    return [...this.grants.values()].filter((grant) => grant.assistantId === assistantId);
  }

  async getActiveAssistant(platform: Platform, platformUserId: string, chatId: string) {
    return this.activeAssistants.get(`${platform}:${platformUserId}:${chatId}`) ?? null;
  }
  async setActiveAssistant(input: ActiveAssistant) {
    this.activeAssistants.set(`${input.platform}:${input.platformUserId}:${input.chatId}`, input);
    return input;
  }
  async deleteActiveAssistant(platform: Platform, platformUserId: string, chatId: string) {
    this.activeAssistants.delete(`${platform}:${platformUserId}:${chatId}`);
  }
  async listActiveAssistantsByAssistant(assistantId: string) {
    return [...this.activeAssistants.values()].filter((active) => active.assistantId === assistantId);
  }

  async getActiveAlias(userId: string, assistantId: string) {
    return [...this.aliases.values()].find((alias) => alias.userId === userId && alias.assistantId === assistantId && alias.status === "active") ?? null;
  }
  async listAliasesByUser(userId: string) {
    return [...this.aliases.values()].filter((alias) => alias.userId === userId);
  }
  async listAliasesByAssistant(assistantId: string) {
    return [...this.aliases.values()].filter((alias) => alias.assistantId === assistantId);
  }
  async createAlias(input: ContextAlias) { this.aliases.set(input.id, input); return input; }
  async touchAlias(id: string, at: Date) {
    const alias = this.aliases.get(id);
    if (alias) this.aliases.set(id, { ...alias, lastMessageAt: at });
  }
  async resetAlias(userId: string, assistantId: string, reason: ResetReason, at: Date) {
    for (const alias of this.aliases.values()) {
      if (alias.userId === userId && alias.assistantId === assistantId && alias.status === "active") {
        this.aliases.set(alias.id, { ...alias, status: "closed", closedAt: at, resetReason: reason });
      }
    }
  }
  async closeAllActiveAliases(reason: ResetReason, at: Date) {
    let count = 0;
    for (const alias of this.aliases.values()) {
      if (alias.status === "active") {
        this.aliases.set(alias.id, { ...alias, status: "closed", closedAt: at, resetReason: reason });
        count++;
      }
    }
    return count;
  }
  async closeIdleAliases(before: Date, reason: ResetReason, at: Date) {
    let count = 0;
    for (const alias of this.aliases.values()) {
      if (alias.status === "active" && alias.lastMessageAt && alias.lastMessageAt < before) {
        this.aliases.set(alias.id, { ...alias, status: "closed", closedAt: at, resetReason: reason });
        count++;
      }
    }
    return count;
  }
  async closeActiveAliasesByAssistant(assistantId: string, reason: ResetReason, at: Date) {
    let count = 0;
    for (const alias of this.aliases.values()) {
      if (alias.assistantId === assistantId && alias.status === "active") {
        this.aliases.set(alias.id, { ...alias, status: "closed", closedAt: at, resetReason: reason });
        count++;
      }
    }
    return count;
  }
  async closeActiveAliasesByUserExceptAssistant(userId: string, keepAssistantId: string, reason: ResetReason, at: Date) {
    let count = 0;
    for (const alias of this.aliases.values()) {
      if (alias.userId === userId && alias.assistantId !== keepAssistantId && alias.status === "active") {
        this.aliases.set(alias.id, { ...alias, status: "closed", closedAt: at, resetReason: reason });
        count++;
      }
    }
    return count;
  }

  async createMaxGroupBinding(input: MaxGroupBinding) { this.maxGroupBindings.set(input.chatId, input); return input; }
  async getMaxGroupBinding(chatId: string) { return this.maxGroupBindings.get(chatId) ?? null; }
  async listMaxGroupBindings() {
    return [...this.maxGroupBindings.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async listMaxGroupBindingsByAssistant(assistantId: string) {
    return [...this.maxGroupBindings.values()]
      .filter((binding) => binding.assistantId === assistantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async updateMaxGroupBinding(chatId: string, fields: Partial<Pick<MaxGroupBinding, "assistantId" | "userId" | "title" | "mode" | "status" | "createdByPlatformUserId" | "updatedAt">>) {
    const binding = this.maxGroupBindings.get(chatId);
    if (!binding) return null;
    const updated = { ...binding, ...fields };
    this.maxGroupBindings.set(chatId, updated);
    return updated;
  }
  async deleteMaxGroupBinding(chatId: string) { this.maxGroupBindings.delete(chatId); }

  async createJob(input: Job) { this.jobs.set(input.id, input); return input; }
  async getJob(id: string) { return this.jobs.get(id) ?? null; }
  async getJobByEventId(eventId: string) { return [...this.jobs.values()].find((job) => job.eventId === eventId) ?? null; }
  async listJobs() { return [...this.jobs.values()]; }
  async listQueuedJobsForRelay(relayAccountId: string, at: Date, limit: number) {
    const relay = this.relayAccounts.get(relayAccountId);
    if (!relay || relay.status !== "active") return [];
    const assistant = this.assistants.get(relay.assistantId);
    if (!assistant || assistant.status !== "active") return [];
    return [...this.jobs.values()]
      .filter((job) => job.relayAccountId === relayAccountId && job.status === "queued" && (!job.nextAttemptAt || job.nextAttemptAt <= at))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }
  async listJobsPastAckDeadline(at: Date) {
    return [...this.jobs.values()].filter((job) => job.status === "sent_to_relay" && job.ackDeadlineAt && job.ackDeadlineAt < at);
  }
  async listActiveJobsOlderThan(before: Date) {
    return [...this.jobs.values()].filter((job) => ["queued", "sent_to_relay", "processing"].includes(job.status) && job.createdAt < before);
  }
  async countActiveJobsForUser(platform: Platform, platformUserId: string) {
    return [...this.jobs.values()].filter((job) => job.platform === platform && job.platformUserId === platformUserId && ["queued", "sent_to_relay", "processing"].includes(job.status)).length;
  }
  async countActiveJobsForAssistant(assistantId: string) {
    return [...this.jobs.values()].filter((job) => job.assistantId === assistantId && ["queued", "sent_to_relay", "processing"].includes(job.status)).length;
  }
  async findLatestActiveJobForUser(platform: Platform, platformUserId: string) {
    return [...this.jobs.values()]
      .filter((job) => job.platform === platform && job.platformUserId === platformUserId && ["queued", "sent_to_relay", "processing"].includes(job.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  }
  async listRecentJobsByAssistant(assistantId: string, limit: number) {
    return [...this.jobs.values()]
      .filter((job) => job.assistantId === assistantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  async updateJobStatus(id: string, status: JobStatus, fields: Partial<Job> = {}) {
    const job = this.jobs.get(id);
    if (!job) return null;
    const updated = { ...job, ...fields, status };
    this.jobs.set(id, updated);
    return updated;
  }
  async cancelJob(id: string, reason: string, at: Date) {
    return this.updateJobStatus(id, "cancelled", { error: reason, cancelledAt: at });
  }

  async createRelayOutbound(input: RelayOutboundMessage) { this.outbound.set(input.id, input); return input; }
  async hasDeliveredRelayOutbound(eventId: string) {
    return [...this.outbound.values()].some((message) => message.eventId === eventId && message.status === "delivered");
  }
  async updateRelayOutboundStatus(id: string, status: RelayOutboundMessage["status"], fields: Partial<RelayOutboundMessage> = {}) {
    const message = this.outbound.get(id);
    if (message) this.outbound.set(id, { ...message, ...fields, status });
  }
}

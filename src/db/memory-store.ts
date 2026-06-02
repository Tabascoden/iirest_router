import type {
  ActiveAssistant,
  Assistant,
  ContextAlias,
  Identity,
  Job,
  JobStatus,
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

  async createRelayAccount(input: RelayAccount) { this.relayAccounts.set(input.relayAccountId, input); return input; }
  async getRelayAccount(relayAccountId: string) { return this.relayAccounts.get(relayAccountId) ?? null; }
  async touchRelayAccount(relayAccountId: string, at: Date) {
    const account = this.relayAccounts.get(relayAccountId);
    if (account) this.relayAccounts.set(relayAccountId, { ...account, lastSeenAt: at, updatedAt: at });
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

  async getActiveAssistant(platform: Platform, platformUserId: string, chatId: string) {
    return this.activeAssistants.get(`${platform}:${platformUserId}:${chatId}`) ?? null;
  }
  async setActiveAssistant(input: ActiveAssistant) {
    this.activeAssistants.set(`${input.platform}:${input.platformUserId}:${input.chatId}`, input);
    return input;
  }

  async getActiveAlias(userId: string, assistantId: string) {
    return [...this.aliases.values()].find((alias) => alias.userId === userId && alias.assistantId === assistantId && alias.status === "active") ?? null;
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

  async createJob(input: Job) { this.jobs.set(input.id, input); return input; }
  async getJob(id: string) { return this.jobs.get(id) ?? null; }
  async getJobByEventId(eventId: string) { return [...this.jobs.values()].find((job) => job.eventId === eventId) ?? null; }
  async listJobs() { return [...this.jobs.values()]; }
  async countActiveJobsForUser(platform: Platform, platformUserId: string) {
    return [...this.jobs.values()].filter((job) => job.platform === platform && job.platformUserId === platformUserId && ["queued", "sent_to_relay", "processing"].includes(job.status)).length;
  }
  async updateJobStatus(id: string, status: JobStatus, fields: Partial<Job> = {}) {
    const job = this.jobs.get(id);
    if (!job) return null;
    const updated = { ...job, ...fields, status };
    this.jobs.set(id, updated);
    return updated;
  }

  async createRelayOutbound(input: RelayOutboundMessage) { this.outbound.set(input.id, input); return input; }
  async updateRelayOutboundStatus(id: string, status: RelayOutboundMessage["status"], fields: Partial<RelayOutboundMessage> = {}) {
    const message = this.outbound.get(id);
    if (message) this.outbound.set(id, { ...message, ...fields, status });
  }
}

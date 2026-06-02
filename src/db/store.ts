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

export interface RouterStore {
  createUser(input: Pick<User, "id" | "title" | "status" | "createdAt" | "updatedAt">): Promise<User>;
  getUser(id: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  updateUserStatus(id: string, status: User["status"]): Promise<User | null>;

  createAssistant(input: Assistant): Promise<Assistant>;
  getAssistant(id: string): Promise<Assistant | null>;
  getAssistantByRelayAccount(relayAccountId: string): Promise<Assistant | null>;
  listAssistants(): Promise<Assistant[]>;

  createRelayAccount(input: RelayAccount): Promise<RelayAccount>;
  getRelayAccount(relayAccountId: string): Promise<RelayAccount | null>;
  listRelayAccounts(): Promise<RelayAccount[]>;
  touchRelayAccount(relayAccountId: string, at: Date): Promise<void>;

  createIdentity(input: Identity): Promise<Identity>;
  getIdentity(platform: Platform, platformUserId: string): Promise<Identity | null>;
  listIdentitiesByUser(userId: string): Promise<Identity[]>;

  grantAssistant(input: UserAssistant): Promise<UserAssistant>;
  revokeAssistant(userId: string, assistantId: string): Promise<void>;
  listGrantedAssistants(userId: string): Promise<Assistant[]>;

  getActiveAssistant(platform: Platform, platformUserId: string, chatId: string): Promise<ActiveAssistant | null>;
  setActiveAssistant(input: ActiveAssistant): Promise<ActiveAssistant>;

  getActiveAlias(userId: string, assistantId: string): Promise<ContextAlias | null>;
  listAliasesByUser(userId: string): Promise<ContextAlias[]>;
  createAlias(input: ContextAlias): Promise<ContextAlias>;
  touchAlias(id: string, at: Date): Promise<void>;
  resetAlias(userId: string, assistantId: string, reason: ResetReason, at: Date): Promise<void>;
  closeAllActiveAliases(reason: ResetReason, at: Date): Promise<number>;
  closeIdleAliases(before: Date, reason: ResetReason, at: Date): Promise<number>;

  createJob(input: Job): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  getJobByEventId(eventId: string): Promise<Job | null>;
  listJobs(): Promise<Job[]>;
  listQueuedJobsForRelay(relayAccountId: string, at: Date, limit: number): Promise<Job[]>;
  listJobsPastAckDeadline(at: Date): Promise<Job[]>;
  listActiveJobsOlderThan(before: Date): Promise<Job[]>;
  countActiveJobsForUser(platform: Platform, platformUserId: string): Promise<number>;
  countActiveJobsForAssistant(assistantId: string): Promise<number>;
  findLatestActiveJobForUser(platform: Platform, platformUserId: string): Promise<Job | null>;
  updateJobStatus(id: string, status: JobStatus, fields?: Partial<Job>): Promise<Job | null>;
  cancelJob(id: string, reason: string, at: Date): Promise<Job | null>;

  createRelayOutbound(input: RelayOutboundMessage): Promise<RelayOutboundMessage>;
  hasDeliveredRelayOutbound(eventId: string): Promise<boolean>;
  updateRelayOutboundStatus(id: string, status: RelayOutboundMessage["status"], fields?: Partial<Pick<RelayOutboundMessage, "error" | "deliveredAt">>): Promise<void>;
}

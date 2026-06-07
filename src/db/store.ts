import type {
  ActiveAssistant,
  Assistant,
  AssistantStatus,
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

export interface RouterStore {
  createUser(input: Pick<User, "id" | "title" | "status" | "createdAt" | "updatedAt">): Promise<User>;
  getUser(id: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  updateUserStatus(id: string, status: User["status"]): Promise<User | null>;

  createAssistant(input: Assistant): Promise<Assistant>;
  getAssistant(id: string): Promise<Assistant | null>;
  getAssistantByRelayAccount(relayAccountId: string): Promise<Assistant | null>;
  listAssistants(): Promise<Assistant[]>;
  updateAssistantStatus(id: string, status: AssistantStatus, at: Date): Promise<Assistant | null>;

  createRelayAccount(input: RelayAccount): Promise<RelayAccount>;
  getRelayAccount(relayAccountId: string): Promise<RelayAccount | null>;
  listRelayAccounts(): Promise<RelayAccount[]>;
  touchRelayAccount(relayAccountId: string, at: Date): Promise<void>;
  updateRelayAccountStatus(relayAccountId: string, status: RelayAccount["status"], at: Date): Promise<RelayAccount | null>;
  updateRelayAccountTokenHash(relayAccountId: string, tokenHash: string, at: Date): Promise<RelayAccount | null>;

  createIdentity(input: Identity): Promise<Identity>;
  getIdentity(platform: Platform, platformUserId: string): Promise<Identity | null>;
  listIdentitiesByUser(userId: string): Promise<Identity[]>;

  grantAssistant(input: UserAssistant): Promise<UserAssistant>;
  revokeAssistant(userId: string, assistantId: string): Promise<void>;
  listGrantedAssistants(userId: string): Promise<Assistant[]>;
  listGrantsByAssistant(assistantId: string): Promise<UserAssistant[]>;

  getActiveAssistant(platform: Platform, platformUserId: string, chatId: string): Promise<ActiveAssistant | null>;
  setActiveAssistant(input: ActiveAssistant): Promise<ActiveAssistant>;
  deleteActiveAssistant(platform: Platform, platformUserId: string, chatId: string): Promise<void>;
  listActiveAssistantsByAssistant(assistantId: string): Promise<ActiveAssistant[]>;

  getActiveAlias(userId: string, assistantId: string): Promise<ContextAlias | null>;
  listAliasesByUser(userId: string): Promise<ContextAlias[]>;
  listAliasesByAssistant(assistantId: string): Promise<ContextAlias[]>;
  createAlias(input: ContextAlias): Promise<ContextAlias>;
  touchAlias(id: string, at: Date): Promise<void>;
  resetAlias(userId: string, assistantId: string, reason: ResetReason, at: Date): Promise<void>;
  closeAllActiveAliases(reason: ResetReason, at: Date): Promise<number>;
  closeIdleAliases(before: Date, reason: ResetReason, at: Date): Promise<number>;
  closeActiveAliasesByAssistant(assistantId: string, reason: ResetReason, at: Date): Promise<number>;
  closeActiveAliasesByUserExceptAssistant(userId: string, keepAssistantId: string, reason: ResetReason, at: Date): Promise<number>;

  createMaxGroupBinding(input: MaxGroupBinding): Promise<MaxGroupBinding>;
  getMaxGroupBinding(chatId: string): Promise<MaxGroupBinding | null>;
  listMaxGroupBindings(): Promise<MaxGroupBinding[]>;
  listMaxGroupBindingsByAssistant(assistantId: string): Promise<MaxGroupBinding[]>;
  updateMaxGroupBinding(chatId: string, fields: Partial<Pick<MaxGroupBinding, "assistantId" | "userId" | "title" | "mode" | "status" | "createdByPlatformUserId" | "updatedAt">>): Promise<MaxGroupBinding | null>;
  deleteMaxGroupBinding(chatId: string): Promise<void>;

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
  listRecentJobsByAssistant(assistantId: string, limit: number): Promise<Job[]>;
  updateJobStatus(id: string, status: JobStatus, fields?: Partial<Job>): Promise<Job | null>;
  cancelJob(id: string, reason: string, at: Date): Promise<Job | null>;

  createRelayOutbound(input: RelayOutboundMessage): Promise<RelayOutboundMessage>;
  hasDeliveredRelayOutbound(eventId: string): Promise<boolean>;
  updateRelayOutboundStatus(id: string, status: RelayOutboundMessage["status"], fields?: Partial<Pick<RelayOutboundMessage, "error" | "deliveredAt">>): Promise<void>;
}

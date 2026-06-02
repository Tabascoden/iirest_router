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
  createAlias(input: ContextAlias): Promise<ContextAlias>;
  touchAlias(id: string, at: Date): Promise<void>;
  resetAlias(userId: string, assistantId: string, reason: ResetReason, at: Date): Promise<void>;
  closeAllActiveAliases(reason: ResetReason, at: Date): Promise<number>;

  createJob(input: Job): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  getJobByEventId(eventId: string): Promise<Job | null>;
  listJobs(): Promise<Job[]>;
  countActiveJobsForUser(platform: Platform, platformUserId: string): Promise<number>;
  updateJobStatus(id: string, status: JobStatus, fields?: Partial<Pick<Job, "error" | "sentAt" | "answeredAt" | "failedAt">>): Promise<Job | null>;

  createRelayOutbound(input: RelayOutboundMessage): Promise<RelayOutboundMessage>;
  updateRelayOutboundStatus(id: string, status: RelayOutboundMessage["status"], fields?: Partial<Pick<RelayOutboundMessage, "error" | "deliveredAt">>): Promise<void>;
}

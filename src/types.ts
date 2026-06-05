export type Platform = "telegram" | "max";
export type UserStatus = "active" | "blocked";
export type AssistantStatus = "active" | "disabled";
export type AliasStatus = "active" | "closed";
export type ResetReason = "manual" | "daily" | "idle" | "admin" | "unknown";
export type JobStatus = "queued" | "sent_to_relay" | "processing" | "answered" | "failed" | "timeout" | "cancelled";
export type RelayOutboundStatus = "received" | "delivered" | "failed" | "ignored";

export interface User {
  id: string;
  title: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Identity {
  id: string;
  userId: string;
  platform: Platform;
  platformUserId: string;
  chatId: string;
  username: string | null;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Assistant {
  id: string;
  title: string;
  relayAccountId: string;
  status: AssistantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAssistant {
  id: string;
  userId: string;
  assistantId: string;
  createdAt: Date;
}

export interface ActiveAssistant {
  id: string;
  platform: Platform;
  platformUserId: string;
  chatId: string;
  assistantId: string;
  updatedAt: Date;
}

export interface ContextAlias {
  id: string;
  userId: string;
  assistantId: string;
  relayPeerId: string;
  relaySenderId: string;
  status: AliasStatus;
  openedAt: Date;
  closedAt: Date | null;
  lastMessageAt: Date | null;
  resetReason: ResetReason | null;
}

export interface RelayAccount {
  id: string;
  relayAccountId: string;
  assistantId: string;
  tokenHash: string;
  status: "active" | "disabled";
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: string;
  eventId: string;
  assistantId: string;
  relayAccountId: string;
  relayPeerId: string;
  relaySenderId: string;
  platform: Platform;
  platformUserId: string;
  chatId: string;
  inboundMessageId: string;
  text: string;
  status: JobStatus;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
  answeredAt: Date | null;
  failedAt: Date | null;
  attempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  ackDeadlineAt: Date | null;
  processingStartedAt: Date | null;
  cancelledAt: Date | null;
}

export interface RelayOutboundMessage {
  id: string;
  eventId: string;
  jobId: string;
  relayAccountId: string;
  relayPeerId: string;
  text: string;
  status: RelayOutboundStatus;
  error: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

export interface ContactPayload {
  phone: string;
  fullName?: string | null;
  maxUserId?: string | null;
  hash?: string | null;
  hashVerified?: boolean | null;
}

export interface NormalizedInboundMessage {
  platform: Platform;
  platformUserId: string;
  chatId: string;
  messageId: string;
  username?: string | null;
  displayName?: string | null;
  text: string;
  contact?: ContactPayload | null;
  createdAt: Date;
}

import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import type { Job } from "../types.js";
import { logger } from "../utils/logger.js";
import { iso, now } from "../utils/time.js";
import type { RelayInbound } from "./relay.protocol.js";
import type { RelayDispatcher } from "./relay.types.js";

export function relayBackoffSeconds(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts));
}

export function relayPayloadFromJob(job: Job): RelayInbound {
  return {
    type: "inbound.message",
    event_id: job.eventId,
    relay_account_id: job.relayAccountId,
    peer: { kind: "dm", id: job.relayPeerId },
    sender: { id: job.relaySenderId, display_name: "Assistant User" },
    message: { id: job.id, text: job.text, created_at: iso(job.createdAt) }
  };
}

export class RelayJobDispatcher {
  constructor(
    private readonly store: RouterStore,
    private readonly relay: RelayDispatcher
  ) {}

  async dispatchJob(job: Job): Promise<Job> {
    if (["answered", "failed", "timeout", "cancelled"].includes(job.status)) return job;
    const relayAccount = await this.store.getRelayAccount(job.relayAccountId);
    if (!relayAccount || relayAccount.status !== "active") {
      return (await this.store.updateJobStatus(job.id, "failed", { error: "relay_disabled", failedAt: now() })) ?? job;
    }
    const assistant = await this.store.getAssistant(job.assistantId);
    if (!assistant || assistant.status !== "active") {
      return (await this.store.updateJobStatus(job.id, "failed", { error: "assistant_disabled", failedAt: now() })) ?? job;
    }
    if (job.attempts >= env.RELAY_MAX_ATTEMPTS) {
      return (await this.store.updateJobStatus(job.id, "failed", { error: "relay_max_attempts", failedAt: now() })) ?? job;
    }

    const attemptAt = now();
    const sent = await this.relay.dispatch(job.relayAccountId, relayPayloadFromJob(job));
    if (!sent) {
      if (!env.QUEUE_WHEN_RELAY_OFFLINE) {
        return (await this.store.updateJobStatus(job.id, "failed", { error: "relay_offline", failedAt: attemptAt })) ?? job;
      }
      return (await this.store.updateJobStatus(job.id, "queued", { nextAttemptAt: attemptAt, error: null })) ?? job;
    }

    const attempts = job.attempts + 1;
    const ackDeadlineAt = new Date(attemptAt.getTime() + env.RELAY_ACK_TIMEOUT_SECONDS * 1000);
    const updated = await this.store.updateJobStatus(job.id, "sent_to_relay", {
      attempts,
      lastAttemptAt: attemptAt,
      sentAt: attemptAt,
      nextAttemptAt: null,
      ackDeadlineAt,
      error: null
    });
    logger.info({ eventId: job.eventId, attempts, relayAccountId: job.relayAccountId }, "job_sent_to_relay");
    return updated ?? job;
  }

  async drainRelayQueue(relayAccountId: string): Promise<number> {
    const queued = await this.store.listQueuedJobsForRelay(relayAccountId, now(), env.MAX_ACTIVE_JOBS_PER_RELAY_ACCOUNT);
    let sent = 0;
    for (const job of queued) {
      if (job.attempts >= env.RELAY_MAX_ATTEMPTS) {
        await this.store.updateJobStatus(job.id, "failed", { error: "relay_max_attempts", failedAt: now() });
        continue;
      }
      if ((await this.store.countActiveJobsForAssistant(job.assistantId)) > env.MAX_ACTIVE_JOBS_PER_ASSISTANT) continue;
      const updated = await this.dispatchJob(job);
      if (updated.status === "sent_to_relay") sent++;
    }
    return sent;
  }

  async requeueAckTimeouts(): Promise<number> {
    const overdue = await this.store.listJobsPastAckDeadline(now());
    let changed = 0;
    for (const job of overdue) {
      const at = now();
      if (job.attempts >= env.RELAY_MAX_ATTEMPTS) {
        await this.store.updateJobStatus(job.id, "failed", { error: "ack_timeout_max_attempts", failedAt: at });
      } else {
        const nextAttemptAt = new Date(at.getTime() + relayBackoffSeconds(job.attempts) * 1000);
        await this.store.updateJobStatus(job.id, "queued", {
          nextAttemptAt,
          ackDeadlineAt: null,
          error: "ack_timeout"
        });
      }
      changed++;
    }
    return changed;
  }
}

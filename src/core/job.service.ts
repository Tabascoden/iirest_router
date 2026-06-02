import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { OutboundService } from "../outbound/outbound.service.js";
import { RelayJobDispatcher } from "../relay/relay.dispatcher.js";
import type { Assistant, ContextAlias, Job, NormalizedInboundMessage } from "../types.js";
import { ids } from "../utils/ids.js";
import { logger } from "../utils/logger.js";
import { now } from "../utils/time.js";

export class JobService {
  constructor(
    private readonly store: RouterStore,
    private readonly dispatcher: RelayJobDispatcher,
    private readonly outbound: OutboundService
  ) {}

  async createAndDispatch(message: NormalizedInboundMessage, assistant: Assistant, alias: ContextAlias): Promise<Job | null> {
    if (message.text.length > env.MAX_TEXT_LENGTH) {
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: `Message is too long. Limit: ${env.MAX_TEXT_LENGTH} characters.` });
      return null;
    }

    const activeJobs = await this.store.countActiveJobsForUser(message.platform, message.platformUserId);
    if (activeJobs >= env.MAX_ACTIVE_JOBS_PER_USER) {
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: "Previous request is still processing. Please wait." });
      return null;
    }

    const at = now();
    const job = await this.store.createJob({
      id: ids.job(),
      eventId: ids.event(),
      assistantId: assistant.id,
      relayAccountId: assistant.relayAccountId,
      relayPeerId: alias.relayPeerId,
      relaySenderId: alias.relaySenderId,
      platform: message.platform,
      platformUserId: message.platformUserId,
      chatId: message.chatId,
      inboundMessageId: message.messageId,
      text: message.text,
      status: "queued",
      error: null,
      createdAt: at,
      sentAt: null,
      answeredAt: null,
      failedAt: null,
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      ackDeadlineAt: null,
      processingStartedAt: null,
      cancelledAt: null
    });

    const updated = await this.dispatcher.dispatchJob(job);
    if (updated.status === "sent_to_relay") {
      await this.store.touchAlias(alias.id, now());
      return updated;
    }
    if (updated.status === "queued") {
      logger.warn({ eventId: job.eventId, relayAccountId: assistant.relayAccountId }, "job_queued_relay_offline");
      return updated;
    }

    if (updated.error === "relay_offline") {
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: "Assistant relay is offline. Try again later." });
    }
    return updated;
  }
}

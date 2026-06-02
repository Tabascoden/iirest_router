import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { OutboundService } from "../outbound/outbound.service.js";
import type { RelayDispatcher } from "../relay/relay.types.js";
import type { Assistant, ContextAlias, Job, NormalizedInboundMessage } from "../types.js";
import { ids } from "../utils/ids.js";
import { logger } from "../utils/logger.js";
import { iso, now } from "../utils/time.js";

export class JobService {
  constructor(
    private readonly store: RouterStore,
    private readonly relay: RelayDispatcher,
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
      failedAt: null
    });

    const payload = {
      type: "inbound.message" as const,
      event_id: job.eventId,
      relay_account_id: assistant.relayAccountId,
      peer: { kind: "dm" as const, id: alias.relayPeerId },
      sender: { id: alias.relaySenderId, display_name: "Assistant User" as const },
      message: { id: job.id, text: message.text, created_at: iso(at) }
    };

    const sent = await this.relay.dispatch(assistant.relayAccountId, payload);
    if (sent) {
      await this.store.updateJobStatus(job.id, "sent_to_relay", { sentAt: now() });
      await this.store.touchAlias(alias.id, now());
      logger.info({ eventId: job.eventId, relayAccountId: assistant.relayAccountId }, "job_sent_to_relay");
      return job;
    }

    if (env.QUEUE_WHEN_RELAY_OFFLINE) {
      logger.warn({ eventId: job.eventId, relayAccountId: assistant.relayAccountId }, "job_queued_relay_offline");
      return job;
    }

    await this.store.updateJobStatus(job.id, "failed", { error: "relay_offline", failedAt: now() });
    await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: "Assistant relay is offline. Try again later." });
    return job;
  }
}

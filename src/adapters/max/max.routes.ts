import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { RouterService } from "../../core/router.service.js";
import { OutboundService } from "../../outbound/outbound.service.js";
import { logger, maskId } from "../../utils/logger.js";
import { normalizeMaxUpdate } from "./max.adapter.js";

function safeMaxWebhookSummary(body: unknown) {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const message = record.message && typeof record.message === "object" ? record.message as Record<string, unknown> : null;
  const recipient = message?.recipient && typeof message.recipient === "object" ? message.recipient as Record<string, unknown> : null;
  const sender = message?.sender && typeof message.sender === "object" ? message.sender as Record<string, unknown> : null;
  const chat = record.chat && typeof record.chat === "object" ? record.chat as Record<string, unknown> : null;
  const bodyValue = message?.body && typeof message.body === "object" ? message.body as Record<string, unknown> : null;
  const text = bodyValue?.text ?? message?.text ?? record.text;
  const chatId = record.chat_id ?? chat?.chat_id ?? chat?.id ?? recipient?.chat_id ?? recipient?.id;
  const userId = record.user_id ?? sender?.user_id ?? sender?.id;
  return {
    updateType: typeof record.update_type === "string" ? record.update_type : undefined,
    chatId: chatId !== undefined ? maskId("chat", String(chatId)) : undefined,
    platformUserId: userId !== undefined ? maskId("max", String(userId)) : undefined,
    hasMessage: Boolean(message),
    hasText: typeof text === "string" && text.length > 0,
    textLength: typeof text === "string" ? text.length : undefined,
    recipientType: typeof recipient?.type === "string" ? recipient.type : undefined,
    chatType: typeof chat?.type === "string" ? chat.type : undefined
  };
}

export function registerMaxRoutes(app: FastifyInstance, router: RouterService, outbound: OutboundService) {
  app.post("/webhooks/max/:botKey", async (request, reply) => {
    const { botKey } = request.params as { botKey: string };
    if (botKey !== env.MAX_WEBHOOK_BOT_KEY) return reply.code(404).send({ ok: false });
    const secretHeader = request.headers["x-max-bot-api-secret"] ?? request.headers["x-max-webhook-secret"];
    if (env.MAX_WEBHOOK_SECRET && secretHeader !== env.MAX_WEBHOOK_SECRET) {
      return reply.code(401).send({ ok: false });
    }
    logger.info(safeMaxWebhookSummary(request.body), "max_webhook_received");
    const normalized = normalizeMaxUpdate(request.body);
    if (normalized && "unsupported" in normalized) {
      logger.info({ chatId: normalized.chatId ? maskId("chat", normalized.chatId) : undefined }, "max_webhook_unsupported");
    } else if (normalized && "event" in normalized) {
      void router.handleMaxChatEvent(normalized);
    } else if (normalized) {
      void router.handleInbound(normalized);
    } else {
      logger.info(safeMaxWebhookSummary(request.body), "max_webhook_normalize_null");
    }
    return reply.send({ ok: true });
  });
}

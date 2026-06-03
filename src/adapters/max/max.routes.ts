import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { RouterService } from "../../core/router.service.js";
import { OutboundService } from "../../outbound/outbound.service.js";
import { logger, maskId } from "../../utils/logger.js";
import { normalizeMaxUpdate } from "./max.adapter.js";

export function registerMaxRoutes(app: FastifyInstance, router: RouterService, outbound: OutboundService) {
  app.post("/webhooks/max/:botKey", async (request, reply) => {
    const { botKey } = request.params as { botKey: string };
    if (botKey !== env.MAX_WEBHOOK_BOT_KEY) return reply.code(404).send({ ok: false });
    const secretHeader = request.headers["x-max-bot-api-secret"] ?? request.headers["x-max-webhook-secret"];
    if (env.MAX_WEBHOOK_SECRET && secretHeader !== env.MAX_WEBHOOK_SECRET) {
      return reply.code(401).send({ ok: false });
    }
    const normalized = normalizeMaxUpdate(request.body);
    if (normalized && "unsupported" in normalized) {
      logger.info({ chatId: normalized.chatId ? maskId("chat", normalized.chatId) : undefined }, "max_webhook_unsupported");
    } else if (normalized) {
      void router.handleInbound(normalized);
    }
    return reply.send({ ok: true });
  });
}

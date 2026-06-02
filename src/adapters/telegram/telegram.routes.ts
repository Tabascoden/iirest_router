import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { OutboundService } from "../../outbound/outbound.service.js";
import { RouterService } from "../../core/router.service.js";
import { messages } from "../../messages/ru.js";
import { normalizeTelegramUpdate } from "./telegram.adapter.js";

const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string, limit = 120, windowMs = 60_000): boolean {
  const nowMs = Date.now();
  const hit = hits.get(key);
  if (!hit || hit.resetAt < nowMs) {
    hits.set(key, { count: 1, resetAt: nowMs + windowMs });
    return false;
  }
  hit.count++;
  return hit.count > limit;
}

export function registerTelegramRoutes(app: FastifyInstance, router: RouterService, outbound: OutboundService) {
  app.post("/webhooks/telegram/:botKey", async (request, reply) => {
    const { botKey } = request.params as { botKey: string };
    const ip = request.ip;
    if (botKey !== env.TELEGRAM_WEBHOOK_BOT_KEY) return reply.code(404).send({ ok: false });
    if (rateLimited(`${ip}:${botKey}`, env.WEBHOOK_RATE_LIMIT_PER_MINUTE)) return reply.code(429).send({ ok: false });
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers["x-telegram-bot-api-secret-token"];
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) return reply.code(401).send({ ok: false });
    }

    const normalized = normalizeTelegramUpdate(request.body);
    if (normalized && "unsupported" in normalized && normalized.chatId) {
      void outbound.sendText({ platform: "telegram", chatId: normalized.chatId, text: messages.textOnly });
    } else if (normalized && !("unsupported" in normalized)) {
      void router.handleInbound(normalized);
    }
    return reply.send({ ok: true });
  });
}

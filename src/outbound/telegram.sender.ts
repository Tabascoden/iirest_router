import { env } from "../config/env.js";
import { logger, maskId } from "../utils/logger.js";
import type { OutboundSender } from "./outbound.service.js";

export class TelegramSender implements OutboundSender {
  async sendText(params: { platform: "telegram" | "max"; chatId: string; text: string }): Promise<void> {
    if (params.platform !== "telegram") return;
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.warn({ chatId: maskId("chat", params.chatId) }, "telegram_token_missing");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.TELEGRAM_SEND_TIMEOUT_MS);
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: params.chatId, text: params.text }),
        signal: controller.signal
      });
      if (!response.ok) {
        const body = await response.text();
        let retryAfter = "";
        try {
          const parsed = JSON.parse(body) as { parameters?: { retry_after?: number } };
          retryAfter = parsed.parameters?.retry_after ? ` retry_after=${parsed.parameters.retry_after}` : "";
        } catch {
          retryAfter = "";
        }
        const shortBody = body.slice(0, 500);
        logger.warn({ status: response.status, body: shortBody, retryAfter, chatId: maskId("chat", params.chatId) }, "telegram_send_failed");
        throw new Error(`telegram_send_failed:${response.status}${retryAfter} body=${shortBody}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

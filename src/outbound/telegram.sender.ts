import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { OutboundSender } from "./outbound.service.js";

export class TelegramSender implements OutboundSender {
  async sendText(params: { platform: "telegram" | "max"; chatId: string; text: string }): Promise<void> {
    if (params.platform !== "telegram") return;
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.warn({ chatId: params.chatId }, "telegram_token_missing");
      return;
    }
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: params.chatId, text: params.text })
    });
    if (!response.ok) {
      throw new Error(`telegram_send_failed:${response.status}`);
    }
  }
}

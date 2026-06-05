import { env } from "../config/env.js";
import { logger, maskId } from "../utils/logger.js";
import type { OutboundKeyboardParams, OutboundSender, OutboundTextParams } from "./outbound.service.js";

export class TelegramSender implements OutboundSender {
  async sendText(params: OutboundTextParams): Promise<void> {
    await this.sendTelegramMessage(params, { chat_id: params.chatId, text: params.text });
  }

  async sendCommandMenu(params: OutboundTextParams): Promise<void> {
    await this.sendTelegramMessage(params, {
      chat_id: params.chatId,
      text: params.text,
      reply_markup: {
        keyboard: [
          ["/restaurants", "/restaurant"],
          ["/id", "/reset"],
          ["/admin", "/help"]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true
      }
    });
  }

  async sendInlineKeyboard(params: OutboundKeyboardParams): Promise<void> {
    await this.sendTelegramMessage(params, {
      chat_id: params.chatId,
      text: params.text,
      reply_markup: {
        inline_keyboard: params.buttons.map((row) => row.map((button) => {
          if ("url" in button && button.url) return { text: button.text, url: button.url };
          if ("requestContact" in button && button.requestContact) return { text: button.text, callback_data: "/admin Нужен доступ" };
          return { text: button.text, callback_data: button.payload ?? "/help" };
        }))
      }
    });
  }

  private async sendTelegramMessage(params: OutboundTextParams, body: Record<string, unknown>): Promise<void> {
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
        body: JSON.stringify(body),
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

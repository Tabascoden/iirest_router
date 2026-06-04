import { env } from "../config/env.js";
import { logger, maskId } from "../utils/logger.js";
import type { OutboundSender, OutboundTextParams } from "./outbound.service.js";

const maxCommandMenuAttachment = {
  type: "inline_keyboard",
  payload: {
    buttons: [
      [
        { type: "callback", text: "🏢 Рестораны", payload: "/restaurants" },
        { type: "callback", text: "📍 Текущий ресторан", payload: "/restaurant" }
      ],
      [
        { type: "callback", text: "🆔 Мой ID", payload: "/id" },
        { type: "callback", text: "🔄 Сбросить контекст", payload: "/reset" }
      ],
      [
        { type: "callback", text: "👤 Администратор", payload: "/admin" },
        { type: "callback", text: "❓ Помощь", payload: "/help" }
      ]
    ]
  }
};

export class MaxSender implements OutboundSender {
  async sendText(params: OutboundTextParams): Promise<void> {
    await this.sendMaxMessage(params, { text: params.text, notify: true, ...(env.MAX_SEND_FORMAT ? { format: env.MAX_SEND_FORMAT } : {}) });
  }

  async sendCommandMenu(params: OutboundTextParams): Promise<void> {
    await this.sendMaxMessage(params, {
      text: params.text,
      notify: true,
      ...(env.MAX_SEND_FORMAT ? { format: env.MAX_SEND_FORMAT } : {}),
      attachments: [maxCommandMenuAttachment]
    });
  }

  private async sendMaxMessage(params: OutboundTextParams, body: Record<string, unknown>): Promise<void> {
    if (params.platform !== "max") return;
    if (!env.MAX_BOT_TOKEN) {
      logger.warn({ chatId: maskId("chat", params.chatId) }, "max_token_missing");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.MAX_SEND_TIMEOUT_MS);
    try {
      const url = new URL("/messages", env.MAX_API_BASE_URL);
      url.searchParams.set("chat_id", params.chatId);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: env.MAX_BOT_TOKEN,
          "content-type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        const level = response.status === 401 ? "error" : "warn";
        logger[level]({ status: response.status, body, chatId: maskId("chat", params.chatId) }, "max_send_failed");
        throw new Error(`max_send_failed:${response.status} body=${body}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn({ timeoutMs: env.MAX_SEND_TIMEOUT_MS, chatId: maskId("chat", params.chatId) }, "max_send_timeout");
        throw new Error(`max_send_timeout:${env.MAX_SEND_TIMEOUT_MS}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

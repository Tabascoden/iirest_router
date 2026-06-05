import { env } from "../config/env.js";
import { logger, maskId } from "../utils/logger.js";
import type { OutboundKeyboardButton, OutboundKeyboardParams, OutboundSender, OutboundTextParams } from "./outbound.service.js";

type MaxKeyboardButton =
  | { type: "callback"; text: string; payload: string }
  | { type: "link"; text: string; url: string };

function toMaxButton(button: OutboundKeyboardButton): MaxKeyboardButton {
  if ("url" in button && button.url) return { type: "link", text: button.text, url: button.url };
  return { type: "callback", text: button.text, payload: button.payload ?? "" };
}

function buildMaxCommandMenuAttachment() {
  const buttons: MaxKeyboardButton[][] = [
    [
      { type: "callback", text: "🆕 Новая тема", payload: "/reset" }
    ],
    [
      { type: "callback", text: "🏢 Мои рестораны", payload: "/restaurants" },
      { type: "callback", text: "📍 Текущий", payload: "/restaurant" }
    ]
  ];

  const adminProfileUrl = process.env.MAX_ADMIN_PROFILE_URL?.trim();
  if (adminProfileUrl?.startsWith("http://") || adminProfileUrl?.startsWith("https://")) {
    buttons.push([{ type: "link", text: "❓ Помощь", url: adminProfileUrl }]);
  } else {
    buttons.push([{ type: "callback", text: "❓ Помощь", payload: "/help" }]);
  }

  return {
    type: "inline_keyboard",
    payload: { buttons }
  };
}

function buildMaxInlineKeyboardAttachment(buttons: OutboundKeyboardButton[][]) {
  return {
    type: "inline_keyboard",
    payload: {
      buttons: buttons.map((row) => row.map(toMaxButton))
    }
  };
}

export class MaxSender implements OutboundSender {
  async sendText(params: OutboundTextParams): Promise<void> {
    await this.sendMaxMessage(params, { text: params.text, notify: true, ...(env.MAX_SEND_FORMAT ? { format: env.MAX_SEND_FORMAT } : {}) });
  }

  async sendCommandMenu(params: OutboundTextParams): Promise<void> {
    await this.sendMaxMessage(params, {
      text: params.text,
      notify: true,
      ...(env.MAX_SEND_FORMAT ? { format: env.MAX_SEND_FORMAT } : {}),
      attachments: [buildMaxCommandMenuAttachment()]
    });
  }

  async sendInlineKeyboard(params: OutboundKeyboardParams): Promise<void> {
    await this.sendMaxMessage(params, {
      text: params.text,
      notify: true,
      ...(env.MAX_SEND_FORMAT ? { format: env.MAX_SEND_FORMAT } : {}),
      attachments: [buildMaxInlineKeyboardAttachment(params.buttons)]
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

import { logger } from "../utils/logger.js";
import type { OutboundSender } from "./outbound.service.js";

export class MaxSender implements OutboundSender {
  async sendText(params: { platform: "telegram" | "max"; chatId: string; text: string }): Promise<void> {
    if (params.platform === "max") {
      logger.info({ chatId: params.chatId, length: params.text.length }, "max_sender_skeleton");
    }
  }
}

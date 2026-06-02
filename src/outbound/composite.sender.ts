import type { OutboundSender } from "./outbound.service.js";

export class CompositeSender implements OutboundSender {
  constructor(private readonly senders: OutboundSender[]) {}

  async sendText(params: { platform: "telegram" | "max"; chatId: string; text: string }): Promise<void> {
    for (const sender of this.senders) {
      await sender.sendText(params);
    }
  }
}

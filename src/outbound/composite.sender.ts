import type { OutboundKeyboardParams, OutboundSender, OutboundTextParams } from "./outbound.service.js";

export class CompositeSender implements OutboundSender {
  constructor(private readonly senders: OutboundSender[]) {}

  async sendText(params: OutboundTextParams): Promise<void> {
    for (const sender of this.senders) {
      await sender.sendText(params);
    }
  }

  async sendCommandMenu(params: OutboundTextParams): Promise<void> {
    for (const sender of this.senders) {
      await sender.sendCommandMenu(params);
    }
  }

  async sendInlineKeyboard(params: OutboundKeyboardParams): Promise<void> {
    for (const sender of this.senders) {
      await sender.sendInlineKeyboard(params);
    }
  }
}

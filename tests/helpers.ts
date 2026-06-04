import type { OutboundSender } from "../src/outbound/outbound.service.js";
import type { Platform } from "../src/types.js";

export class CapturingSender implements OutboundSender {
  sent: Array<{ platform: Platform; chatId: string; text: string }> = [];
  menus: Array<{ platform: Platform; chatId: string; text: string }> = [];

  async sendText(params: { platform: Platform; chatId: string; text: string }) {
    this.sent.push(params);
  }

  async sendCommandMenu(params: { platform: Platform; chatId: string; text: string }) {
    this.menus.push(params);
    this.sent.push(params);
  }
}

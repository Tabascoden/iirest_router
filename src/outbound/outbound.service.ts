import { env } from "../config/env.js";
import type { Platform } from "../types.js";

export type OutboundTextParams = { platform: Platform; chatId: string; text: string };
export type OutboundKeyboardButton =
  | { text: string; payload: string; url?: never; requestContact?: never }
  | { text: string; url: string; payload?: never; requestContact?: never }
  | { text: string; requestContact: true; payload?: never; url?: never };
export type OutboundKeyboardParams = OutboundTextParams & { buttons: OutboundKeyboardButton[][] };

export interface OutboundSender {
  sendText(params: OutboundTextParams): Promise<void>;
  sendCommandMenu(params: OutboundTextParams): Promise<void>;
  sendInlineKeyboard?(params: OutboundKeyboardParams): Promise<void>;
}

export class OutboundService {
  constructor(private readonly sender: OutboundSender) {}

  async sendText(params: OutboundTextParams): Promise<void> {
    for (const text of splitText(params.text, env.OUTBOUND_MAX_CHARS)) {
      await this.sender.sendText({ ...params, text });
    }
  }

  async sendCommandMenu(params: OutboundTextParams): Promise<void> {
    await this.sender.sendCommandMenu(params);
  }

  async sendInlineKeyboard(params: OutboundKeyboardParams): Promise<void> {
    if (this.sender.sendInlineKeyboard) {
      await this.sender.sendInlineKeyboard(params);
      return;
    }
    await this.sendText(params);
  }
}

export function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }
  return chunks;
}

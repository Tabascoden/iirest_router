import { env } from "../config/env.js";
import type { Platform } from "../types.js";

export type OutboundTextParams = { platform: Platform; chatId: string; text: string };

export interface OutboundSender {
  sendText(params: OutboundTextParams): Promise<void>;
  sendCommandMenu(params: OutboundTextParams): Promise<void>;
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
}

export function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }
  return chunks;
}

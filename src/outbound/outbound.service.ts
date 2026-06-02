import { env } from "../config/env.js";
import type { Platform } from "../types.js";

export interface OutboundSender {
  sendText(params: { platform: Platform; chatId: string; text: string }): Promise<void>;
}

export class OutboundService {
  constructor(private readonly sender: OutboundSender) {}

  async sendText(params: { platform: Platform; chatId: string; text: string }): Promise<void> {
    for (const text of splitText(params.text, env.OUTBOUND_MAX_CHARS)) {
      await this.sender.sendText({ ...params, text });
    }
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

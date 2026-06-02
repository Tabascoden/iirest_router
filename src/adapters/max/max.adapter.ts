import type { NormalizedInboundMessage } from "../common/normalized-message.js";
import { maxUpdateSchema } from "./max.types.js";

export function normalizeMaxUpdate(body: unknown): NormalizedInboundMessage | { unsupported: true; chatId: string } | null {
  const update = maxUpdateSchema.safeParse(body);
  if (!update.success) return null;
  if (!update.data.text) return { unsupported: true, chatId: String(update.data.chat_id) };
  return {
    platform: "max",
    platformUserId: String(update.data.user_id),
    chatId: String(update.data.chat_id),
    messageId: String(update.data.message_id),
    username: update.data.username ?? null,
    displayName: update.data.display_name ?? null,
    text: update.data.text,
    createdAt: new Date()
  };
}

import type { NormalizedInboundMessage } from "../common/normalized-message.js";
import { telegramUpdateSchema } from "./telegram.types.js";

export function normalizeTelegramUpdate(body: unknown): NormalizedInboundMessage | { unsupported: true; chatId?: string } | null {
  const update = telegramUpdateSchema.safeParse(body);
  if (!update.success || !update.data.message) return null;
  const message = update.data.message;
  const chatId = String(message.chat.id);
  if (!message.from) return null;
  if (!message.text) return { unsupported: true, chatId };
  const displayName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || null;
  return {
    platform: "telegram",
    platformUserId: String(message.from.id),
    chatId,
    messageId: String(message.message_id),
    username: message.from.username ?? null,
    displayName,
    text: message.text,
    createdAt: message.date ? new Date(message.date * 1000) : new Date()
  };
}

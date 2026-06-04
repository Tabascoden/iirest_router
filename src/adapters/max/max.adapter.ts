import type { NormalizedInboundMessage } from "../common/normalized-message.js";
import { logger, maskId } from "../../utils/logger.js";
import { maxUpdateSchema, type MaxUpdate } from "./max.types.js";

type UnsupportedMaxUpdate = { unsupported: true; chatId?: string };

function payloadFromAttachments(update: MaxUpdate): string | null {
  const attachments = update.message?.body?.attachments;
  if (!Array.isArray(attachments)) return null;

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") continue;
    const record = attachment as Record<string, unknown>;
    if (record.type !== "data") continue;
    if (typeof record.data === "string") return record.data;
    const payload = record.payload;
    if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).data === "string") {
      return (payload as Record<string, string>).data;
    }
  }

  return null;
}

function textFromUpdate(update: MaxUpdate): string | null {
  return payloadFromAttachments(update) ?? update.message?.body?.text ?? update.message?.text ?? update.text ?? null;
}

function idToString(value: string | number | undefined): string | null {
  return value === undefined ? null : String(value);
}

function userIdFromUpdate(update: MaxUpdate): string | null {
  return idToString(
    update.callback?.user?.user_id
    ?? update.callback?.user?.id
    ?? update.user?.user_id
    ?? update.user?.id
    ?? update.message?.sender?.user_id
    ?? update.message?.sender?.id
    ?? update.user_id
  );
}

function chatIdFromUpdate(update: MaxUpdate): string | null {
  return idToString(update.chat_id ?? update.message?.recipient?.chat_id);
}

function displayNameFromUpdate(update: MaxUpdate): string | null {
  const user = update.callback?.user ?? update.user ?? update.message?.sender;
  return user?.name ?? update.display_name ?? ([user?.first_name, user?.last_name].filter(Boolean).join(" ") || null);
}

function timestampFromUpdate(update: MaxUpdate): Date {
  const value = Number(update.callback?.timestamp ?? update.timestamp ?? update.message?.timestamp);
  if (!Number.isFinite(value) || value <= 0) return new Date();
  return new Date(value < 1_000_000_000_000 ? value * 1000 : value);
}

function messageIdFromUpdate(update: MaxUpdate): string {
  return String(update.callback?.callback_id ?? update.message?.mid ?? update.message?.message_id ?? update.message?.id ?? update.message_id ?? update.timestamp ?? Date.now());
}

function normalizeMessageCreated(update: MaxUpdate): NormalizedInboundMessage | UnsupportedMaxUpdate | null {
  const platformUserId = userIdFromUpdate(update);
  const chatId = chatIdFromUpdate(update);
  if (!platformUserId || !chatId) return null;

  const text = textFromUpdate(update);
  if (!text) return { unsupported: true, chatId };

  const user = update.user ?? update.message?.sender;
  return {
    platform: "max",
    platformUserId,
    chatId,
    messageId: messageIdFromUpdate(update),
    username: user?.username ?? update.username ?? null,
    displayName: displayNameFromUpdate(update),
    text,
    createdAt: timestampFromUpdate(update)
  };
}

function normalizeMessageCallback(update: MaxUpdate): NormalizedInboundMessage | UnsupportedMaxUpdate | null {
  const platformUserId = userIdFromUpdate(update);
  const chatId = chatIdFromUpdate(update);
  if (!platformUserId || !chatId) return null;

  const text = update.callback?.payload?.trim();
  if (!text) return { unsupported: true, chatId };

  const user = update.callback?.user ?? update.user ?? update.message?.sender;
  return {
    platform: "max",
    platformUserId,
    chatId,
    messageId: messageIdFromUpdate(update),
    username: user?.username ?? update.username ?? null,
    displayName: displayNameFromUpdate(update),
    text,
    createdAt: timestampFromUpdate(update)
  };
}

function normalizeBotStarted(update: MaxUpdate): NormalizedInboundMessage | null {
  const platformUserId = userIdFromUpdate(update);
  const chatId = chatIdFromUpdate(update);
  if (!platformUserId || !chatId) return null;

  const payload = update.payload?.trim();
  const user = update.user ?? update.message?.sender;
  return {
    platform: "max",
    platformUserId,
    chatId,
    messageId: messageIdFromUpdate(update),
    username: user?.username ?? update.username ?? null,
    displayName: displayNameFromUpdate(update),
    text: payload ? `/start ${payload}` : "/start",
    createdAt: timestampFromUpdate(update)
  };
}

export function normalizeMaxUpdate(body: unknown): NormalizedInboundMessage | UnsupportedMaxUpdate | null {
  const update = maxUpdateSchema.safeParse(body);
  if (!update.success) return null;
  const updateType = update.data.update_type ?? "message_created";
  if (updateType === "message_created") return normalizeMessageCreated(update.data);
  if (updateType === "message_callback") return normalizeMessageCallback(update.data);
  if (updateType === "bot_started") return normalizeBotStarted(update.data);

  const chatId = chatIdFromUpdate(update.data);
  logger.info({ updateType, chatId: chatId ? maskId("chat", chatId) : undefined }, "max_update_unsupported");
  return { unsupported: true, chatId: chatId ?? undefined };
}

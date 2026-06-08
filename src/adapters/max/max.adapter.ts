import type { ChatType, NormalizedInboundMessage, NormalizedMaxChatEvent } from "../common/normalized-message.js";
import { logger, maskId } from "../../utils/logger.js";
import { maxUpdateSchema, type MaxUpdate } from "./max.types.js";

type UnsupportedMaxUpdate = { unsupported: true; chatId?: string };
export type NormalizedMaxUpdate = NormalizedInboundMessage | NormalizedMaxChatEvent | UnsupportedMaxUpdate;

function parseVcardValue(vcf: string, key: string): string | null {
  for (const line of vcf.split(/\r?\n/)) {
    const [left, ...right] = line.split(":");
    if (!left || right.length === 0) continue;
    if (left.toUpperCase().split(";")[0] === key.toUpperCase()) return right.join(":").trim();
  }
  return null;
}

function contactFromAttachments(update: MaxUpdate) {
  const attachments = update.message?.body?.attachments;
  if (!Array.isArray(attachments)) return null;

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") continue;
    const record = attachment as Record<string, unknown>;
    if (record.type !== "contact") continue;
    const payload = record.payload;
    if (!payload || typeof payload !== "object") continue;

    const payloadRecord = payload as Record<string, unknown>;
    const vcf = typeof payloadRecord.vcf_info === "string" ? payloadRecord.vcf_info : "";
    const phone = parseVcardValue(vcf, "TEL");
    if (!phone) continue;

    const maxInfo = payloadRecord.max_info && typeof payloadRecord.max_info === "object"
      ? payloadRecord.max_info as Record<string, unknown>
      : null;

    const fullName = parseVcardValue(vcf, "FN")
      ?? (typeof maxInfo?.name === "string" ? maxInfo.name : null);

    const maxUserId = maxInfo?.user_id !== undefined ? String(maxInfo.user_id) : null;
    const hash = typeof payloadRecord.hash === "string" ? payloadRecord.hash : null;

    return { phone, fullName, maxUserId, hash, hashVerified: null };
  }

  return null;
}

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
  return idToString(update.chat_id ?? update.chat?.chat_id ?? update.chat?.id ?? update.message?.recipient?.chat_id ?? update.message?.recipient?.id);
}

function chatTitleFromUpdate(update: MaxUpdate): string | null {
  return update.chat?.title ?? update.message?.recipient?.title ?? update.title ?? null;
}

function chatTypeFromUpdate(update: MaxUpdate): ChatType {
  const type = update.chat?.type ?? update.message?.recipient?.type;
  if (type === "chat" || type === "channel" || update.is_channel === true) return "group";
  return "direct";
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

  const contact = contactFromAttachments(update);
  const text = textFromUpdate(update) ?? (contact ? "/contact" : null);
  if (!text) return { unsupported: true, chatId };

  const user = update.user ?? update.message?.sender;
  return {
    platform: "max",
    platformUserId,
    chatId,
    messageId: messageIdFromUpdate(update),
    username: user?.username ?? update.username ?? null,
    displayName: displayNameFromUpdate(update),
    chatType: chatTypeFromUpdate(update),
    text,
    contact,
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
    chatType: chatTypeFromUpdate(update),
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
    chatType: chatTypeFromUpdate(update),
    text: payload ? `/start ${payload}` : "/start",
    createdAt: timestampFromUpdate(update)
  };
}

function normalizeBotChatEvent(update: MaxUpdate, event: "bot_added" | "bot_removed"): NormalizedMaxChatEvent | null {
  const chatId = chatIdFromUpdate(update);
  if (!chatId) return null;
  return {
    platform: "max",
    event,
    chatId,
    platformUserId: userIdFromUpdate(update),
    displayName: displayNameFromUpdate(update),
    chatTitle: chatTitleFromUpdate(update),
    isChannel: update.is_channel ?? null,
    createdAt: timestampFromUpdate(update)
  };
}

export function normalizeMaxUpdate(body: unknown): NormalizedMaxUpdate | null {
  const update = maxUpdateSchema.safeParse(body);
  if (!update.success) return null;
  const updateType = update.data.update_type ?? "message_created";
  if (updateType === "message_created") return normalizeMessageCreated(update.data);
  if (updateType === "message_callback") return normalizeMessageCallback(update.data);
  if (updateType === "bot_started") return normalizeBotStarted(update.data);
  if (updateType === "bot_added") return normalizeBotChatEvent(update.data, "bot_added");
  if (updateType === "bot_removed") return normalizeBotChatEvent(update.data, "bot_removed");

  const chatId = chatIdFromUpdate(update.data);
  logger.info({ updateType, chatId: chatId ? maskId("chat", chatId) : undefined }, "max_update_unsupported");
  return { unsupported: true, chatId: chatId ?? undefined };
}

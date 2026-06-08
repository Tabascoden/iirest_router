import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { messages } from "../messages/ru.js";
import { OutboundService } from "../outbound/outbound.service.js";
import type { Assistant, Identity, MaxGroupBinding, NormalizedInboundMessage, NormalizedMaxChatEvent } from "../types.js";
import { logger, maskId } from "../utils/logger.js";
import { AliasService } from "./alias.service.js";
import { AssistantService } from "./assistant.service.js";
import { CommandService } from "./command.service.js";
import { IdentityService } from "./identity.service.js";
import { JobService } from "./job.service.js";

export class RouterService {
  private readonly identityService: IdentityService;
  private readonly assistantService: AssistantService;
  private readonly aliasService: AliasService;
  private readonly commandService: CommandService;

  constructor(
    private readonly store: RouterStore,
    private readonly outbound: OutboundService,
    private readonly jobService: JobService
  ) {
    this.identityService = new IdentityService(store);
    this.assistantService = new AssistantService(store);
    this.aliasService = new AliasService(store);
    this.commandService = new CommandService(store, outbound, this.assistantService, this.aliasService);
  }

  async handleInbound(message: NormalizedInboundMessage): Promise<void> {
    logger.info({
      platform: message.platform,
      platformUserId: maskId(message.platform, message.platformUserId),
      chatId: maskId("chat", message.chatId),
      chatType: message.chatType ?? "direct"
    }, "inbound_received");

    const identity = await this.identityService.findByMessage(message);

    if (message.platform === "max") {
      const groupBinding = await this.findMaxGroupBinding(message.chatId);
      if (groupBinding || message.chatType === "group") {
        await this.handleMaxGroupMessage(message, identity, groupBinding);
        return;
      }
    }

    if (await this.commandService.handle(message, identity)) return;

    if (!identity) {
      logger.info({ platform: message.platform }, "identity_not_found");
      const accessRequestSent = await this.commandService.notifyAccessRequest(message, identity, "message");
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: messages.accessNotFound(`${message.platform}:${message.platformUserId}`, accessRequestSent)
      });
      return;
    }

    const user = await this.store.getUser(identity.userId);
    if (!user || user.status !== "active") return;

    const assistant = await this.assistantService.resolveActive(identity, message);
    if (!assistant) return;
    if (assistant === "choose") return;

    logger.info({ assistantId: assistant.id }, "assistant_selected");
    const alias = await this.aliasService.getOrCreateActive(user.id, assistant.id);
    logger.info({ aliasId: alias.id, relayPeerId: alias.relayPeerId }, "context_alias_created");
    await this.jobService.createAndDispatch(message, assistant, alias);
  }

  async handleMaxChatEvent(event: NormalizedMaxChatEvent): Promise<void> {
    logger.info({
      event: event.event,
      chatId: maskId("chat", event.chatId),
      platformUserId: event.platformUserId ? maskId("max", event.platformUserId) : undefined
    }, "max_chat_event_received");

    if (event.event === "bot_removed") {
      const existing = await this.findMaxGroupBinding(event.chatId);
      if (existing) await this.store.updateMaxGroupBinding(existing.chatId, { status: "disabled", updatedAt: event.createdAt });
      return;
    }

    if (!env.SUPPORT_PLATFORM || !env.SUPPORT_CHAT_ID) return;
    await this.outbound.sendText({
      platform: env.SUPPORT_PLATFORM,
      chatId: env.SUPPORT_CHAT_ID,
      text: [
        "Бота добавили в Max-группу.",
        `chatId: ${event.chatId}`,
        event.chatTitle ? `title: ${event.chatTitle}` : null,
        event.platformUserId ? `addedBy platformUserId: ${event.platformUserId}` : null,
        event.displayName ? `addedBy displayName: ${event.displayName}` : null,
        "",
        "Подключить группу:",
        `npm run --silent max:groupctl -- bind --slug <slug> --chat-id ${event.chatId} --mode mention_only`
      ].filter((line): line is string => line !== null).join("\n")
    });
  }

  private async handleMaxGroupMessage(message: NormalizedInboundMessage, identity: Identity | null, knownBinding?: MaxGroupBinding | null): Promise<void> {
    const binding = knownBinding ?? await this.findMaxGroupBinding(message.chatId);
    if (!binding || binding.status !== "active") {
      logger.info({ chatId: maskId("chat", message.chatId) }, "max_group_binding_not_found");
      return;
    }

    const assistant = await this.store.getAssistant(binding.assistantId);
    if (!assistant || assistant.status !== "active") {
      logger.info({ assistantId: binding.assistantId }, "max_group_assistant_inactive");
      return;
    }

    if (!this.shouldReplyInGroup(binding, message)) {
      logger.info({ chatId: maskId("chat", message.chatId), mode: binding.mode }, "max_group_message_ignored");
      return;
    }

    if (binding.mode === "admin_only" && !(await this.isGroupAdmin(identity, assistant))) {
      logger.info({ chatId: maskId("chat", message.chatId) }, "max_group_sender_not_allowed");
      return;
    }

    const groupUser = await this.store.getUser(binding.userId);
    if (!groupUser || groupUser.status !== "active") return;

    const assistantMessage = stripGroupAddressing(message);
    logger.info({ assistantId: assistant.id, mode: binding.mode }, "max_group_assistant_selected");
    const alias = await this.aliasService.getOrCreateActive(groupUser.id, assistant.id);
    logger.info({ aliasId: alias.id, relayPeerId: alias.relayPeerId }, "max_group_context_alias_created");
    await this.jobService.createAndDispatch(assistantMessage, assistant, alias);
  }

  private async findMaxGroupBinding(chatId: string): Promise<MaxGroupBinding | null> {
    const exact = await this.store.getMaxGroupBinding(chatId);
    if (exact) return exact;
    const alternate = alternateSignedChatId(chatId);
    return alternate ? await this.store.getMaxGroupBinding(alternate) : null;
  }

  private shouldReplyInGroup(binding: MaxGroupBinding, message: NormalizedInboundMessage): boolean {
    if (binding.mode === "all_messages" || binding.mode === "admin_only") return true;
    return isAddressedToBot(message.text);
  }

  private async isGroupAdmin(identity: Identity | null, assistant: Assistant): Promise<boolean> {
    if (!identity) return false;
    const user = await this.store.getUser(identity.userId);
    if (!user || user.status !== "active") return false;
    const grants = await this.store.listGrantedAssistants(identity.userId);
    return grants.some((grant) => grant.id === assistant.id && grant.status === "active");
  }
}

function alternateSignedChatId(chatId: string): string | null {
  if (!isSignedIntegerText(chatId)) return null;
  return chatId.startsWith("-") ? chatId.slice(1) : `-${chatId}`;
}

function isSignedIntegerText(value: string): boolean {
  const body = value.startsWith("-") ? value.slice(1) : value;
  return body.length > 0 && [...body].every((char) => char >= "0" && char <= "9");
}

function isAddressedToBot(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (value.startsWith("/ask ")) return true;
  const lower = value.toLowerCase();
  if (lower === "бот" || lower.startsWith("бот ") || lower.startsWith("бот,") || lower.startsWith("бот:")) return true;
  const username = env.MAX_BOT_USERNAME.trim().replace(/^@/, "").toLowerCase();
  return username ? lower.includes(`@${username}`) : false;
}

function stripGroupAddressing(message: NormalizedInboundMessage): NormalizedInboundMessage {
  let text = message.text.trim();
  if (text.startsWith("/ask ")) text = text.slice("/ask ".length).trim();
  text = stripBotPrefix(text);
  const username = env.MAX_BOT_USERNAME.trim().replace(/^@/, "");
  if (username) text = removeTokenCaseInsensitive(text, `@${username}`).trim();
  return { ...message, text: text || message.text };
}

function stripBotPrefix(text: string): string {
  const lower = text.toLowerCase();
  if (!(lower === "бот" || lower.startsWith("бот ") || lower.startsWith("бот,") || lower.startsWith("бот:"))) return text;
  return text.slice(3).replace(/^[: ,]+/, "").trim();
}

function removeTokenCaseInsensitive(text: string, token: string): string {
  const lowerText = text.toLowerCase();
  const lowerToken = token.toLowerCase();
  const index = lowerText.indexOf(lowerToken);
  if (index < 0) return text;
  return `${text.slice(0, index)} ${text.slice(index + token.length)}`;
}

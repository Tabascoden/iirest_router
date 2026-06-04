import type { RouterStore } from "../db/store.js";
import { env } from "../config/env.js";
import { messages } from "../messages/ru.js";
import { OutboundService } from "../outbound/outbound.service.js";
import type { Identity, NormalizedInboundMessage } from "../types.js";
import { AliasService } from "./alias.service.js";
import { AssistantService } from "./assistant.service.js";

export class CommandService {
  constructor(
    private readonly store: RouterStore,
    private readonly outbound: OutboundService,
    private readonly assistantService: AssistantService,
    private readonly aliasService: AliasService
  ) {}

  async handle(message: NormalizedInboundMessage, identity: Identity | null): Promise<boolean> {
    const rawText = message.text.trim();
    const text = normalizeCommandText(rawText);
    if (!text.startsWith("/")) return false;

    if (text === "/help") {
      await this.outbound.sendCommandMenu({
        platform: message.platform,
        chatId: message.chatId,
        text: messages.commands
      });
      return true;
    }

    if (text === "/id") {
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: await this.buildIdText(message, identity)
      });
      return true;
    }

    if (text === "/admin" || text.startsWith("/admin ")) {
      await this.handleAdmin(message, identity, text.slice("/admin".length).trim());
      return true;
    }

    if (!identity) {
      const accessRequestSent = await this.notifyAccessRequest(message, identity, text === "/start" ? "start" : "command");
      const id = `${message.platform}:${message.platformUserId}`;
      const textToSend = messages.accessNotFound(id, accessRequestSent);
      const send = text === "/start" ? this.outbound.sendCommandMenu.bind(this.outbound) : this.outbound.sendText.bind(this.outbound);
      await send({
        platform: message.platform,
        chatId: message.chatId,
        text: textToSend
      });
      return true;
    }

    if (text === "/start") {
      const assistant = await this.assistantService.resolveActive(identity, message);
      await this.outbound.sendCommandMenu({
        platform: message.platform,
        chatId: message.chatId,
        text: assistant === "choose"
          ? `${messages.chooseAssistant}\n\nВыберите действие:`
          : messages.connected(assistant ? assistant.title : undefined)
      });
      return true;
    }

    if (text === "/assistants") {
      const grants = await this.store.listGrantedAssistants(identity.userId);
      const body = grants.length === 0
        ? messages.noAssistants
        : grants.map((assistant, index) => `${index + 1}. ${assistant.title}`).join("\n");
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: `${body}\n${messages.useAssistantNumber}` });
      return true;
    }

    const assistantMatch = text.match(/^\/assistant\s+(\d+)$/);
    if (assistantMatch) {
      const assistant = await this.assistantService.setActiveByIndex(identity, message, Number(assistantMatch[1]));
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: assistant ? messages.activeAssistant(assistant.title) : messages.assistantNotFound
      });
      return true;
    }

    if (text === "/current") {
      const active = await this.store.getActiveAssistant(message.platform, message.platformUserId, message.chatId);
      const assistant = active ? await this.store.getAssistant(active.assistantId) : null;
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: assistant ? messages.activeAssistant(assistant.title) : messages.noActiveAssistant
      });
      return true;
    }

    if (text === "/reset") {
      const assistant = await this.assistantService.resolveActive(identity, message);
      if (!assistant || assistant === "choose") {
        await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: messages.chooseAssistant });
        return true;
      }
      await this.aliasService.reset(identity.userId, assistant.id, "manual");
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: messages.contextReset });
      return true;
    }

    if (text === "/cancel") {
      const job = await this.store.findLatestActiveJobForUser(message.platform, message.platformUserId);
      if (!job) {
        await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: messages.noActiveRequest });
        return true;
      }
      await this.store.cancelJob(job.id, "user_cancelled", new Date());
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: messages.requestCancelled });
      return true;
    }

    return false;
  }

  async notifyAccessRequest(message: NormalizedInboundMessage, identity: Identity | null, source: "start" | "command" | "message"): Promise<boolean> {
    if (!env.SUPPORT_PLATFORM || !env.SUPPORT_CHAT_ID) return false;

    const adminText = this.buildAdminText({
      title: messages.accessRequestAdminTitle,
      message,
      identity,
      body: [
        `source: ${source}`,
        message.text ? `message: ${message.text.slice(0, 1000)}` : null
      ].filter((line): line is string => line !== null).join("\n")
    });

    await this.outbound.sendText({
      platform: env.SUPPORT_PLATFORM,
      chatId: env.SUPPORT_CHAT_ID,
      text: adminText
    });
    return true;
  }

  private async buildIdText(message: NormalizedInboundMessage, identity: Identity | null): Promise<string> {
    const active = await this.store.getActiveAssistant(message.platform, message.platformUserId, message.chatId);
    const assistant = active ? await this.store.getAssistant(active.assistantId) : null;
    const displayName = identity?.displayName ?? message.displayName ?? null;
    const username = identity?.username ?? message.username ?? null;
    return [
      "Ваш ID:",
      `platform: ${message.platform}`,
      `platformUserId: ${message.platformUserId}`,
      `chatId: ${message.chatId}`,
      displayName ? `displayName: ${displayName}` : null,
      username ? `username: ${username}` : null,
      identity ? `Router userId: ${identity.userId}` : null,
      assistant ? `Текущий ресторан: ${assistant.title}` : null
    ].filter((line): line is string => Boolean(line)).join("\n");
  }

  private async handleAdmin(message: NormalizedInboundMessage, identity: Identity | null, question: string): Promise<void> {
    if (!question) {
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: "Используйте /admin <текст вопроса>. Например: /admin Нужен доступ к ресторану."
      });
      return;
    }

    const adminText = this.buildAdminText({ title: "Вопрос пользователю iirest:", message, identity, body: question });

    if (env.SUPPORT_PLATFORM && env.SUPPORT_CHAT_ID) {
      await this.outbound.sendText({
        platform: env.SUPPORT_PLATFORM,
        chatId: env.SUPPORT_CHAT_ID,
        text: adminText
      });
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: "Вопрос отправлен администратору."
      });
      return;
    }

    await this.outbound.sendText({
      platform: message.platform,
      chatId: message.chatId,
      text: `Поддержка не настроена. Перешлите администратору этот текст:\n\n${adminText}`
    });
  }

  private buildAdminText(params: { title: string; message: NormalizedInboundMessage; identity: Identity | null; body: string }): string {
    const { title, message, identity, body } = params;
    const userIdText = identity ? `Router userId: ${identity.userId}` : "Router userId: не найден";
    return [
      title,
      `platform: ${message.platform}`,
      `platformUserId: ${message.platformUserId}`,
      `chatId: ${message.chatId}`,
      userIdText,
      message.displayName ? `displayName: ${message.displayName}` : null,
      message.username ? `username: ${message.username}` : null,
      "",
      body
    ].filter((line): line is string => line !== null).join("\n");
  }
}

function normalizeCommandText(text: string): string {
  if (text === "/restaurants") return "/assistants";
  if (text === "/restaurant") return "/current";
  if (text === "/whoami") return "/id";
  const restaurantMatch = text.match(/^\/restaurant\s+(\d+)$/);
  if (restaurantMatch) return `/assistant ${restaurantMatch[1]}`;
  return text;
}

import type { RouterStore } from "../db/store.js";
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
    const text = message.text.trim();
    if (!text.startsWith("/")) return false;

    if (text === "/help") {
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: messages.commands
      });
      return true;
    }

    if (!identity) {
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: messages.accessNotFound(`${message.platform}:${message.platformUserId}`)
      });
      return true;
    }

    if (text === "/start") {
      const assistant = await this.assistantService.resolveActive(identity, message);
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: assistant === "choose"
          ? messages.chooseAssistant
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
}

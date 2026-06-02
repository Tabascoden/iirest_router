import type { RouterStore } from "../db/store.js";
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
        text: "Commands: /start, /help, /assistants, /current, /reset, /cancel"
      });
      return true;
    }

    if (!identity) {
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: `Access not found.\nSend this ID to the administrator:\n${message.platform}:${message.platformUserId}`
      });
      return true;
    }

    if (text === "/start") {
      const assistant = await this.assistantService.resolveActive(identity, message);
      const assistantText = assistant && assistant !== "choose" ? `\nActive assistant: ${assistant.title}.` : "";
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: assistant === "choose"
          ? "You are connected. Choose an assistant with /assistants."
          : `You are connected to iirest Assistant.${assistantText}`
      });
      return true;
    }

    if (text === "/assistants") {
      const grants = await this.store.listGrantedAssistants(identity.userId);
      const body = grants.length === 0
        ? "No assistants are assigned."
        : grants.map((assistant, index) => `${index + 1}. ${assistant.title}`).join("\n");
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: `${body}\nUse /assistant <number> to select.` });
      return true;
    }

    const assistantMatch = text.match(/^\/assistant\s+(\d+)$/);
    if (assistantMatch) {
      const assistant = await this.assistantService.setActiveByIndex(identity, message, Number(assistantMatch[1]));
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: assistant ? `Active assistant: ${assistant.title}.` : "Assistant not found."
      });
      return true;
    }

    if (text === "/current") {
      const active = await this.store.getActiveAssistant(message.platform, message.platformUserId, message.chatId);
      const assistant = active ? await this.store.getAssistant(active.assistantId) : null;
      await this.outbound.sendText({
        platform: message.platform,
        chatId: message.chatId,
        text: assistant ? `Active assistant: ${assistant.title}.` : "No active assistant selected."
      });
      return true;
    }

    if (text === "/reset") {
      const assistant = await this.assistantService.resolveActive(identity, message);
      if (!assistant || assistant === "choose") {
        await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: "Choose an assistant first with /assistants." });
        return true;
      }
      await this.aliasService.reset(identity.userId, assistant.id, "manual");
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: "Context reset." });
      return true;
    }

    if (text === "/cancel") {
      await this.outbound.sendText({ platform: message.platform, chatId: message.chatId, text: "No active operation was cancelled." });
      return true;
    }

    return false;
  }
}

import type { RouterStore } from "../db/store.js";
import type { Assistant, Identity, NormalizedInboundMessage } from "../types.js";
import { ids } from "../utils/ids.js";
import { now } from "../utils/time.js";

export class AssistantService {
  constructor(private readonly store: RouterStore) {}

  async resolveActive(identity: Identity, message: NormalizedInboundMessage): Promise<Assistant | "choose" | null> {
    const grants = (await this.store.listGrantedAssistants(identity.userId)).filter((assistant) => assistant.status === "active");
    if (grants.length === 0) return null;

    const active = await this.store.getActiveAssistant(message.platform, message.platformUserId, message.chatId);
    if (active) {
      const assistant = grants.find((item) => item.id === active.assistantId);
      if (assistant) return assistant;
    }

    if (grants.length === 1) {
      await this.store.setActiveAssistant({
        id: ids.activeAssistant(),
        platform: message.platform,
        platformUserId: message.platformUserId,
        chatId: message.chatId,
        assistantId: grants[0].id,
        updatedAt: now()
      });
      return grants[0];
    }

    return "choose";
  }

  async setActiveByIndex(identity: Identity, message: NormalizedInboundMessage, index: number): Promise<Assistant | null> {
    const grants = (await this.store.listGrantedAssistants(identity.userId)).filter((assistant) => assistant.status === "active");
    const assistant = grants[index - 1] ?? null;
    if (!assistant) return null;
    await this.store.setActiveAssistant({
      id: ids.activeAssistant(),
      platform: message.platform,
      platformUserId: message.platformUserId,
      chatId: message.chatId,
      assistantId: assistant.id,
      updatedAt: now()
    });
    return assistant;
  }
}

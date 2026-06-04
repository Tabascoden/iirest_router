import type { RouterStore } from "../db/store.js";
import { messages } from "../messages/ru.js";
import { OutboundService } from "../outbound/outbound.service.js";
import type { NormalizedInboundMessage } from "../types.js";
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
      chatId: maskId("chat", message.chatId)
    }, "inbound_received");

    const identity = await this.identityService.findByMessage(message);
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
}

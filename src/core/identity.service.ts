import type { RouterStore } from "../db/store.js";
import type { NormalizedInboundMessage } from "../types.js";

export class IdentityService {
  constructor(private readonly store: RouterStore) {}

  findByMessage(message: NormalizedInboundMessage) {
    return this.store.getIdentity(message.platform, message.platformUserId);
  }
}

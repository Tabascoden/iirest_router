import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import type { ContextAlias, ResetReason } from "../types.js";
import { ids } from "../utils/ids.js";
import { now } from "../utils/time.js";

export class AliasService {
  constructor(private readonly store: RouterStore) {}

  async getOrCreateActive(userId: string, assistantId: string): Promise<ContextAlias> {
    const existing = await this.store.getActiveAlias(userId, assistantId);
    if (existing) {
      if (!env.IDLE_CONTEXT_RESET_ENABLED || !existing.lastMessageAt) return existing;
      const at = now();
      const idleMs = env.IDLE_CONTEXT_RESET_MINUTES * 60 * 1000;
      if (at.getTime() - existing.lastMessageAt.getTime() > idleMs) {
        await this.store.resetAlias(userId, assistantId, "idle", at);
      } else {
        return existing;
      }
    }
    const at = now();
    return this.store.createAlias({
      id: ids.context(),
      userId,
      assistantId,
      relayPeerId: ids.peer(),
      relaySenderId: ids.sender(),
      status: "active",
      openedAt: at,
      closedAt: null,
      lastMessageAt: at,
      resetReason: null
    });
  }

  async reset(userId: string, assistantId: string, reason: ResetReason = "manual"): Promise<ContextAlias> {
    await this.store.resetAlias(userId, assistantId, reason, now());
    return this.getOrCreateActive(userId, assistantId);
  }
}

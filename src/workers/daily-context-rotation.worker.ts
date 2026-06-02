import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { logger } from "../utils/logger.js";

let lastRotationDate: string | null = null;

export async function rotateDailyContexts(store: RouterStore): Promise<number> {
  if (!env.DAILY_CONTEXT_ROTATION_ENABLED) return 0;
  const count = await store.closeAllActiveAliases("daily", new Date());
  logger.info({ count }, "context_alias_rotated");
  return count;
}

export async function rotateDailyContextsIfDue(store: RouterStore, at = new Date()): Promise<number> {
  if (!env.DAILY_CONTEXT_ROTATION_ENABLED) return 0;
  const [hour, minute] = env.DAILY_CONTEXT_ROTATION_TIME.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  const rotationDate = at.toISOString().slice(0, 10);
  if (lastRotationDate === rotationDate) return 0;
  if (at.getHours() === hour && at.getMinutes() >= minute) {
    lastRotationDate = rotationDate;
    return rotateDailyContexts(store);
  }
  return 0;
}

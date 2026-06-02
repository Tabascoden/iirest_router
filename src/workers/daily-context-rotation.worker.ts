import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { logger } from "../utils/logger.js";

export async function rotateDailyContexts(store: RouterStore): Promise<number> {
  if (!env.DAILY_CONTEXT_ROTATION_ENABLED) return 0;
  const count = await store.closeAllActiveAliases("daily", new Date());
  logger.info({ count }, "context_alias_rotated");
  return count;
}

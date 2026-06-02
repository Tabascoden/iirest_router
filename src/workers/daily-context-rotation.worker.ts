import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { logger } from "../utils/logger.js";

let lastRotationDate: string | null = null;

export function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return { year, month, day, hour, minute, dateKey: `${year}-${month}-${day}` };
}

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
  let parts: ReturnType<typeof getLocalDateParts>;
  try {
    parts = getLocalDateParts(at, env.DAILY_CONTEXT_ROTATION_TIMEZONE);
  } catch (error) {
    logger.error({ timeZone: env.DAILY_CONTEXT_ROTATION_TIMEZONE, err: error }, "daily_rotation_timezone_invalid");
    return 0;
  }
  if (lastRotationDate === parts.dateKey) return 0;
  if (parts.hour === hour && parts.minute >= minute) {
    lastRotationDate = parts.dateKey;
    return rotateDailyContexts(store);
  }
  return 0;
}

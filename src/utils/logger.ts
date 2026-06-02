import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ["token", "relayToken", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "MAX_BOT_TOKEN"],
    remove: true
  }
});

export function maskId(label: string, value: string): string {
  if (env.LOG_PII) return value;
  if (value.length <= 4) return `${label}_***`;
  return `${label}_***${value.slice(-4)}`;
}

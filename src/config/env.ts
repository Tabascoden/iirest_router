import "dotenv/config";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("postgresql://iirest:iirest_password@localhost:5432/iirest_router"),
  REDIS_URL: z.string().optional(),
  TELEGRAM_ENABLED: bool.default(true),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  TELEGRAM_WEBHOOK_BOT_KEY: z.string().default("main"),
  MAX_ENABLED: bool.default(false),
  MAX_MOCK_ENABLED: bool.default(false),
  MAX_BOT_TOKEN: z.string().default(""),
  MAX_WEBHOOK_SECRET: z.string().default(""),
  MAX_WEBHOOK_BOT_KEY: z.string().default("main"),
  RELAY_WS_PATH: z.string().default("/relay/stream"),
  RELAY_ACK_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  RELAY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  RELAY_QUEUE_DRAIN_INTERVAL_SECONDS: z.coerce.number().int().positive().default(5),
  RELAY_PING_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  RELAY_PONG_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  MAX_ACTIVE_JOBS_PER_USER: z.coerce.number().int().positive().default(1),
  MAX_ACTIVE_JOBS_PER_ASSISTANT: z.coerce.number().int().positive().default(5),
  MAX_ACTIVE_JOBS_PER_RELAY_ACCOUNT: z.coerce.number().int().positive().default(20),
  JOB_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(180),
  JOB_TIMEOUT_SCAN_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(4000),
  OUTBOUND_MAX_CHARS: z.coerce.number().int().positive().default(3500),
  DAILY_CONTEXT_ROTATION_ENABLED: bool.default(true),
  DAILY_CONTEXT_ROTATION_TIME: z.string().default("04:00"),
  DAILY_CONTEXT_ROTATION_TIMEZONE: z.string().default("Europe/Moscow"),
  IDLE_CONTEXT_RESET_ENABLED: bool.default(true),
  IDLE_CONTEXT_RESET_MINUTES: z.coerce.number().int().positive().default(360),
  IDLE_CONTEXT_SCAN_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  QUEUE_WHEN_RELAY_OFFLINE: bool.default(false),
  DEV_ENDPOINTS_ENABLED: bool.default(false),
  STATUS_ENDPOINT_ENABLED: bool.default(true),
  TELEGRAM_SEND_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  LOG_PII: bool.default(false),
  LOG_LEVEL: z.string().default("info")
});

export const env = schema.parse(process.env);

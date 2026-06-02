import { describe, expect, it } from "vitest";
import { validateProductionConfig } from "../../src/app.js";
import { env } from "../../src/config/env.js";

describe("production config", () => {
  async function withProductionEnv(fn: () => void | Promise<void>) {
    const snapshot = {
      NODE_ENV: env.NODE_ENV,
      TELEGRAM_ENABLED: env.TELEGRAM_ENABLED,
      TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
      PUBLIC_BASE_URL: env.PUBLIC_BASE_URL
    };
    env.NODE_ENV = "production";
    try {
      return await fn();
    } finally {
      env.NODE_ENV = snapshot.NODE_ENV;
      env.TELEGRAM_ENABLED = snapshot.TELEGRAM_ENABLED;
      env.TELEGRAM_BOT_TOKEN = snapshot.TELEGRAM_BOT_TOKEN;
      env.TELEGRAM_WEBHOOK_SECRET = snapshot.TELEGRAM_WEBHOOK_SECRET;
      env.PUBLIC_BASE_URL = snapshot.PUBLIC_BASE_URL;
    }
  }

  it("requires Telegram bot token in production", async () => {
    await withProductionEnv(() => {
      env.TELEGRAM_ENABLED = true;
      env.TELEGRAM_BOT_TOKEN = "";
      env.TELEGRAM_WEBHOOK_SECRET = "secret";
      env.PUBLIC_BASE_URL = "https://router.example.com";
      expect(() => validateProductionConfig()).toThrow("TELEGRAM_BOT_TOKEN");
    });
  });

  it("requires Telegram webhook secret in production", async () => {
    await withProductionEnv(() => {
      env.TELEGRAM_ENABLED = true;
      env.TELEGRAM_BOT_TOKEN = "token";
      env.TELEGRAM_WEBHOOK_SECRET = "";
      env.PUBLIC_BASE_URL = "https://router.example.com";
      expect(() => validateProductionConfig()).toThrow("TELEGRAM_WEBHOOK_SECRET");
    });
  });

  it("requires https public base url in production", async () => {
    await withProductionEnv(() => {
      env.TELEGRAM_ENABLED = false;
      env.PUBLIC_BASE_URL = "http://router.example.com";
      expect(() => validateProductionConfig()).toThrow("PUBLIC_BASE_URL");
    });
  });
});

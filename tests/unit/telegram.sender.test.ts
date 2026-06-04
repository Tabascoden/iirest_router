import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { TelegramSender } from "../../src/outbound/telegram.sender.js";

describe("TelegramSender", () => {
  const snapshot = {
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_SEND_TIMEOUT_MS: env.TELEGRAM_SEND_TIMEOUT_MS
  };

  afterEach(() => {
    env.TELEGRAM_BOT_TOKEN = snapshot.TELEGRAM_BOT_TOKEN;
    env.TELEGRAM_SEND_TIMEOUT_MS = snapshot.TELEGRAM_SEND_TIMEOUT_MS;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends a reply keyboard command menu for Telegram", async () => {
    env.TELEGRAM_BOT_TOKEN = "telegram_token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new TelegramSender().sendCommandMenu({ platform: "telegram", chatId: "chat_1", text: "help" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottelegram_token/sendMessage");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: "chat_1",
      text: "help",
      reply_markup: {
        keyboard: [
          ["/restaurants", "/restaurant"],
          ["/id", "/reset"],
          ["/admin", "/help"]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true
      }
    });
  });

  it("does not send command menus for Max messages", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await new TelegramSender().sendCommandMenu({ platform: "max", chatId: "chat_1", text: "help" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

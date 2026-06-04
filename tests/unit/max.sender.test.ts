import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { MaxSender } from "../../src/outbound/max.sender.js";

describe("MaxSender", () => {
  const snapshot = {
    MAX_BOT_TOKEN: env.MAX_BOT_TOKEN,
    MAX_API_BASE_URL: env.MAX_API_BASE_URL,
    MAX_SEND_TIMEOUT_MS: env.MAX_SEND_TIMEOUT_MS
  };

  afterEach(() => {
    env.MAX_BOT_TOKEN = snapshot.MAX_BOT_TOKEN;
    env.MAX_API_BASE_URL = snapshot.MAX_API_BASE_URL;
    env.MAX_SEND_TIMEOUT_MS = snapshot.MAX_SEND_TIMEOUT_MS;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends POST /messages with chat_id and Authorization header", async () => {
    env.MAX_BOT_TOKEN = "max_token";
    env.MAX_API_BASE_URL = "https://platform-api.max.ru";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new MaxSender().sendText({ platform: "max", chatId: "chat_1", text: "hello" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://platform-api.max.ru/messages?chat_id=chat_1");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "max_token", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ text: "hello", notify: true });
  });

  it("does not send for Telegram messages", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await new MaxSender().sendText({ platform: "telegram", chatId: "chat_1", text: "hello" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a reply keyboard command menu for Max", async () => {
    env.MAX_BOT_TOKEN = "max_token";
    env.MAX_API_BASE_URL = "https://platform-api.max.ru";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new MaxSender().sendCommandMenu({ platform: "max", chatId: "chat_1", text: "help" });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      text: "help",
      notify: true,
      attachments: [{
        type: "reply_keyboard",
        buttons: [
          [
            { type: "send_message", text: "🏢 Рестораны", payload: "/restaurants" },
            { type: "send_message", text: "📍 Текущий ресторан", payload: "/restaurant" }
          ],
          [
            { type: "send_message", text: "🆔 Мой ID", payload: "/id" },
            { type: "send_message", text: "🔄 Сбросить контекст", payload: "/reset" }
          ],
          [
            { type: "send_message", text: "👤 Администратор", payload: "/admin" },
            { type: "send_message", text: "❓ Помощь", payload: "/help" }
          ]
        ]
      }]
    });
  });

  it("throws a status-specific error on failed responses", async () => {
    env.MAX_BOT_TOKEN = "max_token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad auth", { status: 401 })));

    await expect(new MaxSender().sendText({ platform: "max", chatId: "chat_1", text: "hello" }))
      .rejects.toThrow("max_send_failed:401 body=bad auth");
  });

  it("turns aborts into timeout errors", async () => {
    env.MAX_BOT_TOKEN = "max_token";
    env.MAX_SEND_TIMEOUT_MS = 1;
    vi.stubGlobal("fetch", vi.fn((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })));

    await expect(new MaxSender().sendText({ platform: "max", chatId: "chat_1", text: "hello" }))
      .rejects.toThrow("max_send_timeout:1");
  });
});

import { describe, expect, it } from "vitest";
import { normalizeMaxUpdate } from "../../src/adapters/max/max.adapter.js";

describe("normalizeMaxUpdate", () => {
  it("normalizes message_created updates", () => {
    const normalized = normalizeMaxUpdate({
      update_type: "message_created",
      timestamp: 1_710_000_000,
      chat_id: 555,
      user: { user_id: 123, username: "denis", name: "Denis" },
      message: { mid: "mid_1", body: { text: "hello" } }
    });

    expect(normalized).toEqual({
      platform: "max",
      platformUserId: "123",
      chatId: "555",
      messageId: "mid_1",
      username: "denis",
      displayName: "Denis",
      text: "hello",
      createdAt: new Date(1_710_000_000_000)
    });
  });

  it("normalizes bot_started as /start with payload", () => {
    const normalized = normalizeMaxUpdate({
      update_type: "bot_started",
      timestamp: 1_710_000_000_123,
      chat_id: "555",
      user: { user_id: "123", username: "denis" },
      payload: "invite_42"
    });

    expect(normalized).toMatchObject({
      platform: "max",
      platformUserId: "123",
      chatId: "555",
      messageId: "1710000000123",
      username: "denis",
      text: "/start invite_42",
      createdAt: new Date(1_710_000_000_123)
    });
  });

  it("uses /start when bot_started has no payload", () => {
    const normalized = normalizeMaxUpdate({
      update_type: "bot_started",
      chat_id: 555,
      user: { user_id: 123 }
    });

    expect(normalized).toMatchObject({ text: "/start" });
  });

  it("marks non-text message_created as unsupported", () => {
    const normalized = normalizeMaxUpdate({
      update_type: "message_created",
      chat_id: 555,
      user: { user_id: 123 },
      message: { mid: "mid_1", body: { attachments: [] } }
    });

    expect(normalized).toEqual({ unsupported: true, chatId: "555" });
  });

  it("ignores unsupported event types safely", () => {
    const normalized = normalizeMaxUpdate({
      update_type: "message_removed",
      chat_id: 555,
      user: { user_id: 123 }
    });

    expect(normalized).toEqual({ unsupported: true, chatId: "555" });
  });
});

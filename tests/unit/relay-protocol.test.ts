import { describe, expect, it } from "vitest";
import { parseRelayIncoming } from "../../src/relay/relay.protocol.js";

describe("relay protocol", () => {
  it("accepts hello messages", () => {
    expect(parseRelayIncoming(JSON.stringify({ type: "hello", relay_account_id: "relay_a", token: "rt_x" }))).toEqual({
      type: "hello",
      relay_account_id: "relay_a",
      token: "rt_x"
    });
  });

  it("rejects unknown message types", () => {
    expect(() => parseRelayIncoming(JSON.stringify({ type: "inbound.message" }))).toThrow("unknown_message_type");
  });

  it("accepts outbound messages", () => {
    expect(parseRelayIncoming(JSON.stringify({ type: "outbound.message", event_id: "evt_1", relay_peer_id: "peer_1", text: "hello" })).type).toBe("outbound.message");
  });

  it("accepts ping and pong messages", () => {
    expect(parseRelayIncoming(JSON.stringify({ type: "ping", ts: "2026-06-03T12:00:00.000Z" })).type).toBe("ping");
    expect(parseRelayIncoming(JSON.stringify({ type: "pong", ts: "2026-06-03T12:00:00.000Z" })).type).toBe("pong");
  });
});

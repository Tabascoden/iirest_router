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
});

import { z } from "zod";

export const relayHelloSchema = z.object({
  type: z.literal("hello"),
  relay_account_id: z.string().min(1),
  token: z.string().min(1)
});

export const relayAckSchema = z.object({
  type: z.literal("ack"),
  event_id: z.string().min(1)
});

export const relayOutboundSchema = z.object({
  type: z.literal("outbound.message"),
  event_id: z.string().min(1),
  relay_peer_id: z.string().min(1),
  text: z.string().min(1)
});

export const relayInboundSchema = z.object({
  type: z.literal("inbound.message"),
  event_id: z.string(),
  relay_account_id: z.string(),
  peer: z.object({
    kind: z.literal("dm"),
    id: z.string()
  }),
  sender: z.object({
    id: z.string(),
    display_name: z.literal("Assistant User")
  }),
  message: z.object({
    id: z.string(),
    text: z.string(),
    created_at: z.string()
  })
});

export const relayIncomingSchema = z.discriminatedUnion("type", [relayHelloSchema, relayAckSchema, relayOutboundSchema]);

export type RelayHello = z.infer<typeof relayHelloSchema>;
export type RelayAck = z.infer<typeof relayAckSchema>;
export type RelayOutbound = z.infer<typeof relayOutboundSchema>;
export type RelayInbound = z.infer<typeof relayInboundSchema>;
export type RelayIncoming = z.infer<typeof relayIncomingSchema>;

export function parseRelayIncoming(raw: string): RelayIncoming {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
  const result = relayIncomingSchema.safeParse(parsed);
  if (!result.success) throw new Error("unknown_message_type");
  return result.data;
}

export function protocolError(code: string, message: string) {
  return { type: "error", code, message };
}

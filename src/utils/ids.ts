import { ulid } from "ulid";

export function prefixedId(prefix: string): string {
  return `${prefix}${ulid()}`;
}

export const ids = {
  user: () => prefixedId("user_"),
  assistant: () => prefixedId("asst_"),
  identity: () => prefixedId("ident_"),
  userAssistant: () => prefixedId("ua_"),
  activeAssistant: () => prefixedId("active_"),
  context: () => prefixedId("ctx_"),
  peer: () => prefixedId("peer_"),
  sender: () => prefixedId("sender_"),
  job: () => prefixedId("job_"),
  event: () => prefixedId("evt_"),
  relayAccountRow: () => prefixedId("relay_"),
  outbound: () => prefixedId("out_")
};

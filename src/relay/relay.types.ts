import type { RelayInbound } from "./relay.protocol.js";

export interface RelayDispatcher {
  dispatch(relayAccountId: string, payload: RelayInbound): Promise<boolean>;
}

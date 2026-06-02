import type WebSocket from "ws";
import type { RelayInbound } from "./relay.protocol.js";
import type { RelayDispatcher } from "./relay.types.js";

interface RelayConnection {
  relayAccountId: string;
  socket: WebSocket;
}

export class RelayConnectionRegistry implements RelayDispatcher {
  private readonly connections = new Map<string, RelayConnection>();

  register(relayAccountId: string, socket: WebSocket) {
    this.connections.set(relayAccountId, { relayAccountId, socket });
  }

  unregister(relayAccountId: string, socket: WebSocket) {
    const current = this.connections.get(relayAccountId);
    if (current?.socket === socket) this.connections.delete(relayAccountId);
  }

  list() {
    return [...this.connections.keys()];
  }

  async dispatch(relayAccountId: string, payload: RelayInbound): Promise<boolean> {
    const connection = this.connections.get(relayAccountId);
    if (!connection || connection.socket.readyState !== connection.socket.OPEN) return false;
    connection.socket.send(JSON.stringify(payload));
    return true;
  }
}

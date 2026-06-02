import { Command } from "commander";
import WebSocket from "ws";

const program = new Command()
  .requiredOption("--relay-account <relayAccount>")
  .requiredOption("--token <token>")
  .option("--url <url>", "ws://localhost:3000/relay/stream");

program.parse();
const options = program.opts<{ relayAccount: string; token: string; url: string }>();

const ws = new WebSocket(options.url);

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "hello", relay_account_id: options.relayAccount, token: options.token }));
});

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === "hello.ok") {
    console.log(`connected ${message.relay_account_id}`);
    return;
  }
  if (message.type === "inbound.message") {
    ws.send(JSON.stringify({ type: "ack", event_id: message.event_id }));
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: "outbound.message",
        event_id: message.event_id,
        relay_peer_id: message.peer.id,
        text: `Mock reply: ${message.message.text}`
      }));
    }, 100);
  }
  if (message.type === "ping") {
    ws.send(JSON.stringify({ type: "pong", ts: message.ts }));
  }
  if (message.type === "outbound.ack") {
    console.log(`outbound ${message.status} ${message.event_id}`);
  }
  if (message.type === "error") {
    console.error(message);
  }
});

ws.on("close", () => process.exit(0));

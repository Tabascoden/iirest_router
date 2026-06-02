import type WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import { verifySecret } from "../security/hashing.js";
import { logger } from "../utils/logger.js";
import { now } from "../utils/time.js";
import { OutboundService } from "../outbound/outbound.service.js";
import { ids } from "../utils/ids.js";
import { outboundAck, parseRelayIncoming, protocolError } from "./relay.protocol.js";
import { RelayConnectionRegistry } from "./relay.connection-registry.js";
import { RelayJobDispatcher } from "./relay.dispatcher.js";

export function registerRelayServer(
  app: FastifyInstance,
  store: RouterStore,
  registry: RelayConnectionRegistry,
  outbound: OutboundService,
  dispatcher: RelayJobDispatcher
) {
  app.get(env.RELAY_WS_PATH, { websocket: true }, (socket) => {
    let relayAccountId: string | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
    let pongTimeout: NodeJS.Timeout | null = null;

    const clearRelayTimers = () => {
      if (pingInterval) clearInterval(pingInterval);
      if (pongTimeout) clearTimeout(pongTimeout);
      pingInterval = null;
      pongTimeout = null;
    };

    const startRelayHealthChecks = () => {
      pingInterval = setInterval(() => {
        if (socket.readyState !== socket.OPEN) return;
        socket.send(JSON.stringify({ type: "ping", ts: now().toISOString() }));
        if (pongTimeout) clearTimeout(pongTimeout);
        pongTimeout = setTimeout(() => {
          logger.warn({ relayAccountId }, "relay_pong_timeout");
          socket.close();
        }, env.RELAY_PONG_TIMEOUT_SECONDS * 1000);
      }, env.RELAY_PING_INTERVAL_SECONDS * 1000);
    };

    socket.on("message", async (data) => {
      const raw = data.toString();
      let message;
      try {
        message = parseRelayIncoming(raw);
      } catch (error) {
        socket.send(JSON.stringify(protocolError((error as Error).message, "Unknown message type")));
        return;
      }

      if (message.type === "hello") {
        const account = await store.getRelayAccount(message.relay_account_id);
        if (!account || account.status !== "active" || !(await verifySecret(message.token, account.tokenHash))) {
          socket.send(JSON.stringify(protocolError("unauthorized", "Invalid relay credentials")));
          socket.close();
          return;
        }
        relayAccountId = message.relay_account_id;
        registry.register(relayAccountId, socket as unknown as WebSocket);
        await store.touchRelayAccount(relayAccountId, now());
        socket.send(JSON.stringify({ type: "hello.ok", relay_account_id: relayAccountId }));
        logger.info({ relayAccountId }, "relay_connected");
        startRelayHealthChecks();
        void dispatcher.drainRelayQueue(relayAccountId);
        return;
      }

      if (!relayAccountId) {
        socket.send(JSON.stringify(protocolError("hello_required", "Send hello before other messages")));
        return;
      }
      const authenticatedRelayAccountId = relayAccountId;

      if (message.type === "ping") {
        socket.send(JSON.stringify({ type: "pong", ts: message.ts }));
        return;
      }

      if (message.type === "pong") {
        if (pongTimeout) clearTimeout(pongTimeout);
        pongTimeout = null;
        return;
      }

      if (message.type === "ack") {
        const job = await store.getJobByEventId(message.event_id);
      if (job && job.relayAccountId === authenticatedRelayAccountId && job.status === "sent_to_relay") {
          await store.updateJobStatus(job.id, "processing", { processingStartedAt: now(), ackDeadlineAt: null });
          logger.info({ eventId: message.event_id }, "job_acknowledged");
        }
        return;
      }

      const job = await store.getJobByEventId(message.event_id);
      if (!job || job.relayAccountId !== authenticatedRelayAccountId || job.relayPeerId !== message.relay_peer_id) {
        socket.send(JSON.stringify(protocolError("job_not_found", "No matching job for outbound message")));
        return;
      }

      const createIgnoredOutbound = async (jobId: string, reason: string) => {
        await store.createRelayOutbound({
          id: ids.outbound(),
          eventId: message.event_id,
          jobId,
          relayAccountId: authenticatedRelayAccountId,
          relayPeerId: message.relay_peer_id,
          text: message.text,
          status: "ignored",
          error: reason,
          createdAt: now(),
          deliveredAt: null
        });
        socket.send(JSON.stringify(outboundAck(message.event_id, "ignored", reason)));
        logger.info({ eventId: message.event_id, reason }, "late_outbound_ignored");
      };

      if (!["sent_to_relay", "processing"].includes(job.status)) {
        await createIgnoredOutbound(job.id, "job_already_finalized");
        return;
      }

      if (await store.hasDeliveredRelayOutbound(message.event_id)) {
        await createIgnoredOutbound(job.id, "duplicate_outbound");
        return;
      }

      const out = await store.createRelayOutbound({
        id: ids.outbound(),
        eventId: message.event_id,
        jobId: job.id,
        relayAccountId: authenticatedRelayAccountId,
        relayPeerId: message.relay_peer_id,
        text: message.text,
        status: "received",
        error: null,
        createdAt: now(),
        deliveredAt: null
      });

      try {
        await outbound.sendText({ platform: job.platform, chatId: job.chatId, text: message.text });
        await store.updateRelayOutboundStatus(out.id, "delivered", { deliveredAt: now() });
        await store.updateJobStatus(job.id, "answered", { answeredAt: now() });
        socket.send(JSON.stringify(outboundAck(message.event_id, "delivered")));
        logger.info({ eventId: message.event_id }, "outbound_delivered");
      } catch (error) {
        await store.updateRelayOutboundStatus(out.id, "failed", { error: (error as Error).message });
        await store.updateJobStatus(job.id, "failed", { error: (error as Error).message, failedAt: now() });
        logger.error({ eventId: message.event_id, err: error }, "job_failed");
      }
    });

    socket.on("close", () => {
      clearRelayTimers();
      if (relayAccountId) {
        registry.unregister(relayAccountId, socket as unknown as WebSocket);
        logger.info({ relayAccountId }, "relay_disconnected");
      }
    });
  });
}

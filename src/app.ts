import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { registerMaxRoutes } from "./adapters/max/max.routes.js";
import { registerTelegramRoutes } from "./adapters/telegram/telegram.routes.js";
import type { RouterStore } from "./db/store.js";
import { JobService } from "./core/job.service.js";
import { RouterService } from "./core/router.service.js";
import { CompositeSender } from "./outbound/composite.sender.js";
import { MaxSender } from "./outbound/max.sender.js";
import { OutboundService, type OutboundSender } from "./outbound/outbound.service.js";
import { TelegramSender } from "./outbound/telegram.sender.js";
import { RelayConnectionRegistry } from "./relay/relay.connection-registry.js";
import { registerRelayServer } from "./relay/relay.server.js";

export interface AppDeps {
  store: RouterStore;
  sender?: OutboundSender;
  relayRegistry?: RelayConnectionRegistry;
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: false });
  await app.register(websocket);

  const registry = deps.relayRegistry ?? new RelayConnectionRegistry();
  const sender = deps.sender ?? new CompositeSender([new TelegramSender(), new MaxSender()]);
  const outbound = new OutboundService(sender);
  const jobService = new JobService(deps.store, registry, outbound);
  const router = new RouterService(deps.store, outbound, jobService);

  app.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));
  registerTelegramRoutes(app, router, outbound);
  registerMaxRoutes(app, router, outbound);
  registerRelayServer(app, deps.store, registry, outbound);

  if (env.NODE_ENV !== "production") {
    app.get("/dev/jobs", async () => deps.store.listJobs());
    app.get("/dev/users", async () => deps.store.listUsers());
    app.get("/dev/relay-connections", async () => ({ connections: registry.list() }));
  }

  return app;
}

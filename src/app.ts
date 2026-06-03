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
import { RelayJobDispatcher } from "./relay/relay.dispatcher.js";
import { registerRelayServer } from "./relay/relay.server.js";

export interface AppDeps {
  store: RouterStore;
  sender?: OutboundSender;
  relayRegistry?: RelayConnectionRegistry;
}

export function validateProductionConfig() {
  if (env.NODE_ENV !== "production") return;
  if (env.TELEGRAM_ENABLED && !env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_ENABLED=true but TELEGRAM_BOT_TOKEN is empty in production");
  }
  if (env.TELEGRAM_ENABLED && !env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is required in production");
  }
  if (!env.PUBLIC_BASE_URL.startsWith("https://")) {
    throw new Error("PUBLIC_BASE_URL must start with https:// in production");
  }
  if (env.MAX_ENABLED) {
    if (!env.MAX_BOT_TOKEN) throw new Error("MAX_BOT_TOKEN is required in production");
    if (!env.MAX_WEBHOOK_SECRET) throw new Error("MAX_WEBHOOK_SECRET is required in production");
  }
  if (env.MAX_MOCK_ENABLED) {
    throw new Error("MAX_MOCK_ENABLED must be false in production");
  }
}

export async function buildApp(deps: AppDeps) {
  validateProductionConfig();
  const app = Fastify({ logger: false });
  await app.register(websocket);

  const registry = deps.relayRegistry ?? new RelayConnectionRegistry();
  const dispatcher = new RelayJobDispatcher(deps.store, registry);
  const sender = deps.sender ?? new CompositeSender([new TelegramSender(), new MaxSender()]);
  const outbound = new OutboundService(sender);
  const jobService = new JobService(deps.store, dispatcher, outbound);
  const router = new RouterService(deps.store, outbound, jobService);

  app.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));
  if (env.STATUS_ENDPOINT_ENABLED) {
    app.get("/status", async () => {
      const jobs = await deps.store.listJobs();
      const failedSince = Date.now() - 60 * 60 * 1000;
      return {
        ok: true,
        time: new Date().toISOString(),
        relays: { connected: registry.list() },
        jobs: {
          queued: jobs.filter((job) => job.status === "queued").length,
          sent_to_relay: jobs.filter((job) => job.status === "sent_to_relay").length,
          processing: jobs.filter((job) => job.status === "processing").length,
          timeout: jobs.filter((job) => job.status === "timeout").length,
          failed_last_hour: jobs.filter((job) => job.status === "failed" && job.failedAt && job.failedAt.getTime() >= failedSince).length
        }
      };
    });
  }
  if (env.TELEGRAM_ENABLED) {
    registerTelegramRoutes(app, router, outbound);
  }
  if (env.MAX_ENABLED || env.MAX_MOCK_ENABLED) {
    registerMaxRoutes(app, router, outbound);
  }
  registerRelayServer(app, deps.store, registry, outbound, dispatcher);

  if (env.NODE_ENV === "development" && env.DEV_ENDPOINTS_ENABLED) {
    app.get("/dev/jobs", async () => deps.store.listJobs());
    app.get("/dev/users", async () => deps.store.listUsers());
    app.get("/dev/relay-connections", async () => ({ connections: registry.list() }));
  }

  return { app, dispatcher, registry };
}

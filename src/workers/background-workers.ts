import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";
import type { RelayJobDispatcher } from "../relay/relay.dispatcher.js";
import { logger } from "../utils/logger.js";
import { rotateDailyContextsIfDue } from "./daily-context-rotation.worker.js";
import { closeIdleContexts, markTimedOutJobs } from "./timeout.worker.js";

export function startBackgroundWorkers(params: { store: RouterStore; dispatcher: RelayJobDispatcher }) {
  const timers: NodeJS.Timeout[] = [];

  timers.push(setInterval(async () => {
    try {
      const ackRequeued = await params.dispatcher.requeueAckTimeouts();
      const timedOut = await markTimedOutJobs(params.store);
      if (ackRequeued || timedOut) logger.info({ ackRequeued, timedOut }, "timeout_worker_tick");
    } catch (error) {
      logger.error({ err: error }, "timeout_worker_failed");
    }
  }, env.JOB_TIMEOUT_SCAN_INTERVAL_SECONDS * 1000));

  timers.push(setInterval(async () => {
    try {
      const closed = await closeIdleContexts(params.store);
      if (closed) logger.info({ closed }, "idle_context_reset");
    } catch (error) {
      logger.error({ err: error }, "idle_context_worker_failed");
    }
  }, env.IDLE_CONTEXT_SCAN_INTERVAL_SECONDS * 1000));

  timers.push(setInterval(async () => {
    try {
      await rotateDailyContextsIfDue(params.store);
    } catch (error) {
      logger.error({ err: error }, "daily_rotation_worker_failed");
    }
  }, 60_000));

  return {
    stop() {
      for (const timer of timers) clearInterval(timer);
    }
  };
}

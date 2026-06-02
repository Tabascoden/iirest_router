import { describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import type { RouterStore } from "../../src/db/store.js";
import type { RelayConnectionRegistry } from "../../src/relay/relay.connection-registry.js";
import type { RelayJobDispatcher } from "../../src/relay/relay.dispatcher.js";
import { startBackgroundWorkers } from "../../src/workers/background-workers.js";

describe("background workers", () => {
  it("periodically drains connected relay queues", async () => {
    vi.useFakeTimers();
    const previousInterval = env.RELAY_QUEUE_DRAIN_INTERVAL_SECONDS;
    env.RELAY_QUEUE_DRAIN_INTERVAL_SECONDS = 5;
    const dispatcher = {
      drainRelayQueue: vi.fn(async () => 1),
      requeueAckTimeouts: vi.fn(async () => 0)
    } as unknown as RelayJobDispatcher;
    const registry = { list: () => ["relay_adzhapuri"] } as unknown as RelayConnectionRegistry;
    const store = {
      listActiveJobsOlderThan: vi.fn(async () => []),
      closeIdleAliases: vi.fn(async () => 0)
    } as unknown as RouterStore;

    const workers = startBackgroundWorkers({ store, dispatcher, registry });
    await vi.advanceTimersByTimeAsync(5000);

    expect(dispatcher.drainRelayQueue).toHaveBeenCalledWith("relay_adzhapuri");
    workers.stop();
    env.RELAY_QUEUE_DRAIN_INTERVAL_SECONDS = previousInterval;
    vi.useRealTimers();
  });
});

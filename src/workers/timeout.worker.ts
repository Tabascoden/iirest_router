import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";

export async function markTimedOutJobs(store: RouterStore): Promise<number> {
  const cutoff = new Date(Date.now() - env.JOB_TIMEOUT_SECONDS * 1000);
  const jobs = await store.listActiveJobsOlderThan(cutoff);
  let count = 0;
  for (const job of jobs) {
    await store.updateJobStatus(job.id, "timeout", { error: "job_timeout", failedAt: new Date() });
    count++;
  }
  return count;
}

export async function closeIdleContexts(store: RouterStore): Promise<number> {
  if (!env.IDLE_CONTEXT_RESET_ENABLED) return 0;
  const cutoff = new Date(Date.now() - env.IDLE_CONTEXT_RESET_MINUTES * 60 * 1000);
  return store.closeIdleAliases(cutoff, "idle", new Date());
}

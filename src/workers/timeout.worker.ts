import { env } from "../config/env.js";
import type { RouterStore } from "../db/store.js";

export async function markTimedOutJobs(store: RouterStore): Promise<number> {
  const jobs = await store.listJobs();
  const cutoff = Date.now() - env.JOB_TIMEOUT_SECONDS * 1000;
  let count = 0;
  for (const job of jobs) {
    if (["queued", "sent_to_relay", "processing"].includes(job.status) && job.createdAt.getTime() < cutoff) {
      await store.updateJobStatus(job.id, "timeout", { error: "job_timeout", failedAt: new Date() });
      count++;
    }
  }
  return count;
}

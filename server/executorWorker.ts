import * as db from "./db";
import { runExecutionForPost } from "./executor";

const DEFAULT_INTERVAL_MS = 60_000;

let isTicking = false;

/**
 * One polling tick: picks the next ready-to-execute post (if any) and runs
 * it. Guarded by isTicking so a slow execution never overlaps with the next
 * scheduled tick (single-process idempotency — do not scale this service to
 * more than one replica without adding a DB-level lock).
 */
export async function tick(): Promise<void> {
  if (isTicking) return;
  isTicking = true;
  try {
    const post = await db.getNextReadyToExecute(Date.now());
    if (!post) return;
    await runExecutionForPost(post.id);
  } catch (error) {
    console.error("[ExecutorWorker] Tick failed:", error);
  } finally {
    isTicking = false;
  }
}

/**
 * Own in-process cron/executor trigger. Replaces the Manus Heartbeat
 * dispatch (§5) together with the Manus Python executor (§2) — this single
 * poller now does both jobs, since the app runs on an always-on host.
 */
export function startExecutorWorker(
  intervalMs: number = DEFAULT_INTERVAL_MS
): NodeJS.Timeout {
  return setInterval(() => {
    void tick();
  }, intervalMs);
}

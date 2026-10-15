// Gap 11: Concurrent run prevention via lock file.
//
// .sandcastle/pipeline.lock contains the runId.
// Fresh lock (<4h) → exit 0 with message.
// Stale lock (>4h) → replaced with warning.
// Removed on completion (call release in a finally block).

import { readFileSync, writeFileSync, unlinkSync, statSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { log } from "./logging.mjs";

const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

export function acquireLock(projectRoot: string, runId: string): boolean {
  const lockPath = join(projectRoot, ".sandcastle", "pipeline.lock");

  try {
    const content = readFileSync(lockPath, "utf8").trim();
    const st = statSync(lockPath);
    const ageMs = Date.now() - st.mtimeMs;

    if (ageMs < STALE_THRESHOLD_MS) {
      log(`Pipeline lock held by ${content} (${Math.round(ageMs / 60000)}min old). Exiting.`);
      return false;
    }

    log(`Stale lock from ${content} (${Math.round(ageMs / 3600000)}h old). Replacing.`);
  } catch {
    // No lock file — proceed.
  }

  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, runId + "\n");
  return true;
}

export function releaseLock(projectRoot: string): void {
  const lockPath = join(projectRoot, ".sandcastle", "pipeline.lock");
  try {
    unlinkSync(lockPath);
  } catch {
    // Already removed or never created.
  }
}

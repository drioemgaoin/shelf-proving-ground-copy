// Global T2 orchestrator — post-merge child bug lifecycle.
//
// Runs the T2 suite in a loop, creating child bugs on failure,
// deduplicating by title, auto-closing on pass, and escalating
// after MAX_ROUNDS.

import { execSync, spawnSync } from "child_process";
import { log } from "./logging.mjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface T2Failure {
  name: string;
  fixture: string;
  viewport: string;
}

export interface T2RunResult {
  exitCode: number;
  failures: T2Failure[];
}

export interface GlobalT2Tracker {
  searchBugs: (titlePrefix: string) => Promise<string[]>;
  createBug: (title: string, labels: string[]) => Promise<void>;
  closeBug: (title: string) => Promise<void>;
  escalate: (reason: string) => void;
}

export interface GlobalT2Opts {
  runner: () => Promise<T2RunResult>;
  tracker: GlobalT2Tracker;
}

export interface GlobalT2Result {
  rounds: number;
  green: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ROUNDS = 5;

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

export function bugTitle(name: string, fixture: string, viewport: string): string {
  return `[Global T2] ${name} — ${fixture} @ ${viewport}`;
}

export async function runGlobalT2(opts: GlobalT2Opts): Promise<GlobalT2Result> {
  const { runner, tracker } = opts;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    log(`  Global T2 round ${round}/${MAX_ROUNDS}...`);
    const result = await runner();

    // Exit 2 = infrastructure failure — escalate immediately
    if (result.exitCode === 2) {
      log(`  Global T2: infrastructure failure (exit 2). Escalating.`);
      tracker.escalate("global-infra-failure");
      return { rounds: round, green: false };
    }

    // Collect titles of currently-failing assertions
    const failingTitles = new Set(
      result.failures.map((f) => bugTitle(f.name, f.fixture, f.viewport)),
    );

    // Fetch existing open bugs
    const existingBugs = new Set(await tracker.searchBugs("[Global T2]"));

    // Auto-close: open bugs whose assertion now passes
    for (const title of existingBugs) {
      if (!failingTitles.has(title)) {
        log(`  Global T2: auto-closing — ${title}`);
        await tracker.closeBug(title);
      }
    }

    // Create: new failures not yet tracked
    for (const title of failingTitles) {
      if (!existingBugs.has(title)) {
        log(`  Global T2: filing bug — ${title}`);
        await tracker.createBug(title, ["bug", "Sandcastle"]);
      }
    }

    // All green?
    if (result.exitCode === 0 && result.failures.length === 0) {
      log(`  Global T2: all pass on round ${round}.`);
      return { rounds: round, green: true };
    }

    log(`  Global T2: ${result.failures.length} failure(s) in round ${round}.`);
  }

  // Exhausted — escalate
  log(`  Global T2: ${MAX_ROUNDS} rounds exhausted. Escalating global-oscillation.`);
  tracker.escalate("global-oscillation");
  return { rounds: MAX_ROUNDS, green: false };
}

// ---------------------------------------------------------------------------
// Playwright output parser
// ---------------------------------------------------------------------------

export function parsePlaywrightFailures(output: string): T2Failure[] {
  const failures: T2Failure[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    // Only match lines with failure markers
    if (!/[✘✗×]|^\s*\d+\)/.test(line)) continue;
    const match = line.match(/(\S+):\s+(\S+)\s+@\s+(\w+)\s+\(\d+px\)/);
    if (match) {
      failures.push({ name: match[1]!, fixture: match[2]!, viewport: match[3]! });
    }
  }
  // Deduplicate
  const seen = new Set<string>();
  return failures.filter((f) => {
    const key = `${f.name}|${f.fixture}|${f.viewport}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Real runner — spawns apply-t2.mjs
// ---------------------------------------------------------------------------

export function createT2Runner(): () => Promise<T2RunResult> {
  return async () => {
    const result = spawnSync("node", ["scripts/apply-t2.mjs"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 600_000,
    });
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    return {
      exitCode: result.status ?? 2,
      failures: parsePlaywrightFailures(output),
    };
  };
}

// ---------------------------------------------------------------------------
// Real tracker — wraps shell commands
// ---------------------------------------------------------------------------

export interface TrackerCommands {
  searchCommand: string;
  createBugCommand: string;
  closeBugCommand: string;
  labelCommand: string;
}

export function createT2Tracker(
  commands: TrackerCommands,
  exec: (cmd: string) => string = (cmd) => execSync(cmd, { encoding: "utf8" }),
): GlobalT2Tracker {
  return {
    searchBugs: async (prefix) => {
      try {
        const cmd = commands.searchCommand.replace("<QUERY>", prefix);
        const raw = exec(cmd);
        if (!raw.trim()) return [];
        const issues = JSON.parse(raw);
        return issues.map((i: { title: string }) => i.title);
      } catch {
        return [];
      }
    },
    createBug: async (title, labels) => {
      const labelFlags = labels.map((l) => `--label=${l}`).join(" ");
      const cmd = commands.createBugCommand
        .replace("<TITLE>", title)
        .replace("<DESCRIPTION>", "Auto-filed by Global T2 suite")
        .replace("--label=ready-for-human", labelFlags);
      exec(cmd);
    },
    closeBug: async (title) => {
      try {
        const searchCmd = commands.searchCommand.replace("<QUERY>", title);
        const raw = exec(searchCmd);
        if (!raw.trim()) return;
        const issues = JSON.parse(raw);
        const match = issues.find((i: { title: string }) => i.title === title);
        if (match) {
          exec(commands.closeBugCommand.replace("<ID>", match.id));
        }
      } catch {
        /* search/close failure is non-fatal */
      }
    },
    escalate: (reason) => {
      try {
        const cmd = commands.createBugCommand
          .replace("<TITLE>", `[Escalation] ${reason}`)
          .replace("<DESCRIPTION>", `Global T2 escalation: ${reason}`)
          .replace("--label=ready-for-human", "--label=ready-for-human");
        exec(cmd);
      } catch {
        log(`  ⚠️  Failed to escalate: ${reason}`);
      }
    },
  };
}

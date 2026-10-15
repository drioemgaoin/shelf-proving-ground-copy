// Sandcastle Benchmark Runner
//
// Runs 3 canned use cases (simple, medium, complex) to measure agent
// implementation speed. Each runs in an isolated Docker sandbox on a
// throwaway branch. Nothing is merged or committed to main.
//
// Usage:
//   npx tsx .sandcastle/bench/bench.mts                 # run all 3
//   npx tsx .sandcastle/bench/bench.mts simple           # run one
//   npx tsx .sandcastle/bench/bench.mts simple medium     # run specific ones
//
// Logs go to .sandcastle/logs/bench-<case>.log with timestamps on every
// event. A summary is printed at the end.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const USE_CASES = {
  simple: {
    promptFile: "./.sandcastle/bench/prompts/simple.md",
    maxIterations: 10,
    description: "Add a CSS token (single file edit, typecheck only)",
  },
  medium: {
    promptFile: "./.sandcastle/bench/prompts/medium.md",
    maxIterations: 30,
    description: "Create EmptyState component with unit tests",
  },
  complex: {
    promptFile: "./.sandcastle/bench/prompts/complex.md",
    maxIterations: 100,
    description: "Full shelf grid with acceptance tests + visual QA",
  },
} as const;

type CaseName = keyof typeof USE_CASES;

// Parse CLI args: which cases to run
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const selectedCases: CaseName[] =
  args.length > 0
    ? (args.filter((a) => a in USE_CASES) as CaseName[])
    : (Object.keys(USE_CASES) as CaseName[]);

if (selectedCases.length === 0) {
  console.error(
    `No valid cases. Choose from: ${Object.keys(USE_CASES).join(", ")}`,
  );
  process.exit(1);
}

// ── Warm image ──
const warmImage = execSync("bash .sandcastle/docker/build-warm.sh")
  .toString()
  .trim()
  .split("\n")
  .pop()!;

// Sandbox hooks — lighter than main.mts (no backpressure baseline for simple/medium)
const baseHooks = {
  sandbox: {
    onSandboxReady: [
      { command: "ln -s /warm/node_modules ./node_modules" },
      { command: "cp -a /warm/.beads ./.beads && chmod 700 .beads" },
    ],
  },
};

const fullHooks = {
  sandbox: {
    onSandboxReady: [
      { command: "ln -s /warm/node_modules ./node_modules" },
      { command: "cp -a /warm/.beads ./.beads && chmod 700 .beads" },
      { command: "node .claude/hooks/backpressure.mjs --baseline" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Timestamped logging
// ---------------------------------------------------------------------------

function makeLogging(caseName: string): {
  logging: {
    type: "file";
    path: string;
    onAgentStreamEvent: (event: {
      type: string;
      timestamp: Date;
      name?: string;
      formattedArgs?: string;
      message?: string;
      line?: string;
    }) => void;
  };
  logPath: string;
} {
  const logDir = join(process.cwd(), ".sandcastle/logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `bench-${caseName}.log`);

  // Clear previous log
  writeFileSync(logPath, `--- Bench run: ${caseName} @ ${new Date().toISOString()} ---\n`);

  const onAgentStreamEvent = (event: {
    type: string;
    timestamp: Date;
    name?: string;
    formattedArgs?: string;
    message?: string;
    line?: string;
  }) => {
    const ts = event.timestamp?.toISOString?.() ?? new Date().toISOString();
    const hms = ts.slice(11, 23); // HH:MM:SS.mmm
    let line = "";

    if (event.type === "toolCall") {
      const args = event.formattedArgs?.slice(0, 300) ?? "";
      line = `[${hms}] TOOL  ${event.name}(${args})`;
    } else if (event.type === "text") {
      const firstLine = event.message?.split("\n")[0]?.slice(0, 300) ?? "";
      if (firstLine.trim()) {
        line = `[${hms}] TEXT  ${firstLine}`;
      }
    }
    // Skip raw events to keep log readable

    if (line) {
      try {
        appendFileSync(logPath, line + "\n");
      } catch {
        // swallow
      }
    }
  };

  return {
    logging: { type: "file", path: logPath, onAgentStreamEvent },
    logPath,
  };
}

// ---------------------------------------------------------------------------
// Run a single case
// ---------------------------------------------------------------------------

interface CaseResult {
  name: CaseName;
  description: string;
  durationMs: number;
  commits: number;
  iterations: number;
  success: boolean;
  error?: string;
  logPath: string;
}

async function runCase(name: CaseName): Promise<CaseResult> {
  const config = USE_CASES[name];
  const branch = `bench/${name}-${Date.now()}`;
  const { logging, logPath } = makeLogging(name);
  const hooks = name === "complex" ? fullHooks : baseHooks;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  BENCH: ${name.toUpperCase()} — ${config.description}`);
  console.log(`  Branch: ${branch}`);
  console.log(`  Log: ${logPath}`);
  console.log(`${"=".repeat(60)}\n`);

  const start = Date.now();

  try {
    const sandbox = await sandcastle.createSandbox({
      branch,
      sandbox: docker({ imageName: warmImage }),
      hooks,
      copyToWorktree: [],
    });

    try {
      const result = await sandbox.run({
        name: `bench-${name}`,
        maxIterations: config.maxIterations,
        agent: sandcastle.claudeCode("claude-opus-4-8", {
          env: { UI_GUARD: "afk" },
        }),
        promptFile: config.promptFile,
        logging,
      });

      const durationMs = Date.now() - start;
      const iterations = result.iterations?.length ?? 0;
      const commits = result.commits?.length ?? 0;

      return {
        name,
        description: config.description,
        durationMs,
        commits,
        iterations,
        success: commits > 0,
        logPath,
      };
    } finally {
      await sandbox.close();
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      name,
      description: config.description,
      durationMs,
      commits: 0,
      iterations: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      logPath,
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

console.log(`\nSandcastle Benchmark`);
console.log(`Cases: ${selectedCases.join(", ")}`);
console.log(`Warm image: ${warmImage}\n`);

const results: CaseResult[] = [];

for (const caseName of selectedCases) {
  const result = await runCase(caseName);
  results.push(result);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(60)}`);
console.log(`  BENCHMARK RESULTS`);
console.log(`${"=".repeat(60)}\n`);

const colW = { name: 10, time: 10, iter: 6, commits: 8, status: 10 };

console.log(
  `${"Case".padEnd(colW.name)} ${"Time".padEnd(colW.time)} ${"Iter".padEnd(colW.iter)} ${"Commits".padEnd(colW.commits)} ${"Status".padEnd(colW.status)}`,
);
console.log("-".repeat(50));

for (const r of results) {
  const status = r.success ? "OK" : `FAIL`;
  console.log(
    `${r.name.padEnd(colW.name)} ${formatDuration(r.durationMs).padEnd(colW.time)} ${String(r.iterations).padEnd(colW.iter)} ${String(r.commits).padEnd(colW.commits)} ${status.padEnd(colW.status)}`,
  );
  if (r.error) {
    console.log(`  Error: ${r.error.slice(0, 200)}`);
  }
}

console.log(`\nLogs:`);
for (const r of results) {
  console.log(`  ${r.name}: ${r.logPath}`);
}

// Write machine-readable results
const resultsPath = join(
  process.cwd(),
  ".sandcastle/logs",
  `bench-results-${Date.now()}.json`,
);
writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(`\nResults JSON: ${resultsPath}`);

// Cleanup hint
const branches = results.map(
  (r) => `bench/${r.name}-*`,
);
console.log(
  `\nTo clean up branches: git branch | grep bench/ | xargs git branch -D`,
);

console.log("\nDone.");

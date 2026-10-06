// Parallel Planner — three-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):    An opus agent analyzes open issues, builds a dependency
//                      graph, and outputs a <plan> JSON listing unblocked issues
//                      with their target branch names and UI scope.
//   Phase 2 (Execute): N agents run in parallel via Promise.allSettled, each
//                      working a single issue on its own branch. After
//                      implementation, two sequential QA gates run:
//                        - Visual gate (UI tickets only): visual-qa → fix loop
//                        - Code review gate: review → fix loop
//                      Each gate loops up to 3 rounds until clean.
//   Phase 3 (Merge):   A sonnet agent merges all branches that produced commits.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { dirname } from "path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Timestamped orchestrator logging
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Run stats — provider-agnostic, zero maintenance on model/provider changes
// ---------------------------------------------------------------------------

// Pricing per million tokens ($/M). Keyed by model-name substring;
// first match wins — order specific → general.
const MODEL_PRICING: { pattern: string; input: number; cacheRead: number; cacheWrite: number; output: number }[] = [
  // Anthropic
  { pattern: "opus",    input: 15,   cacheRead: 1.5,   cacheWrite: 18.75, output: 75 },
  { pattern: "sonnet",  input: 3,    cacheRead: 0.3,   cacheWrite: 3.75,  output: 15 },
  { pattern: "haiku",   input: 0.8,  cacheRead: 0.08,  cacheWrite: 1,     output: 4 },
  // OpenAI
  { pattern: "o3",      input: 10,   cacheRead: 2.5,   cacheWrite: 10,    output: 40 },
  { pattern: "o4-mini", input: 1.1,  cacheRead: 0.275, cacheWrite: 1.1,   output: 4.4 },
  { pattern: "gpt-4.1", input: 2,    cacheRead: 0.5,   cacheWrite: 2,     output: 8 },
  { pattern: "gpt-4o",  input: 2.5,  cacheRead: 1.25,  cacheWrite: 2.5,   output: 10 },
];
const FALLBACK_PRICING = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

const SMART_ZONE_LIMIT = 100_000;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Tagged agent — wraps any sandcastle provider, remembering the model string
// so downstream code (logRunStats) can derive pricing without duplication.
interface TaggedAgent {
  provider: sandcastle.AgentProvider;
  model: string;
}

// ── Provider factories ──
// Each returns a TaggedAgent. Add more as needed; the rest of the file
// never mentions a specific provider or model.
function claude(model: string, options?: Parameters<typeof sandcastle.claudeCode>[1]): TaggedAgent {
  return { provider: sandcastle.claudeCode(model, options), model };
}

function codex(model: string, options?: Parameters<typeof sandcastle.codex>[1]): TaggedAgent {
  return { provider: sandcastle.codex(model, options), model };
}

// Timed run wrappers — call sandcastle, then log stats. The model for pricing
// comes from the TaggedAgent, so adding a new provider/model needs zero changes
// here: just pass a different agent(...) to the run site.

interface HasIterations {
  iterations: ReadonlyArray<{ usage?: { inputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number; outputTokens: number } }>;
}

async function timedRun<T extends Awaited<ReturnType<typeof sandcastle.run>>>(
  label: string,
  ta: TaggedAgent,
  opts: Omit<Parameters<typeof sandcastle.run>[0], "agent"> & { output?: any },
): Promise<T> {
  const start = Date.now();
  const result = await sandcastle.run({ ...opts, agent: ta.provider } as any) as T;
  logRunStats(label, ta.model, start, result);
  return result;
}

async function timedSandboxRun(
  label: string,
  ta: TaggedAgent,
  sandbox: sandcastle.Sandbox,
  opts: Omit<Parameters<sandcastle.Sandbox["run"]>[0], "agent">,
) {
  const start = Date.now();
  const result = await sandbox.run({ ...opts, agent: ta.provider });
  logRunStats(label, ta.model, start, result);
  return result;
}

function logRunStats(label: string, model: string, startMs: number, result: HasIterations) {
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  let totalInput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalOutput = 0;
  let hasUsage = false;

  for (const iter of result.iterations) {
    if (iter.usage) {
      hasUsage = true;
      totalInput += iter.usage.inputTokens;
      totalCacheRead += iter.usage.cacheReadInputTokens;
      totalCacheWrite += iter.usage.cacheCreationInputTokens;
      totalOutput += iter.usage.outputTokens;
    }
  }

  if (!hasUsage) {
    log(`  📊 ${label}: ${elapsed}s | no usage data`);
    return;
  }

  // The three input fields are additive: total context the LLM reads =
  // input (uncached) + cache-read + cache-write. This is everything:
  // your prompt + CLAUDE.md + system instructions + tool defs + conversation.
  const totalContextTokens = totalInput + totalCacheRead + totalCacheWrite;
  const inSmartZone = totalContextTokens <= SMART_ZONE_LIMIT;
  const zoneTag = inSmartZone ? "✅ ≤100K" : `⚠️  ${Math.round(totalContextTokens / 1000)}K`;

  const lower = model.toLowerCase();
  const pricing = MODEL_PRICING.find((p) => lower.includes(p.pattern)) ?? FALLBACK_PRICING;
  const cost =
    (totalInput / 1_000_000) * pricing.input +
    (totalCacheRead / 1_000_000) * pricing.cacheRead +
    (totalCacheWrite / 1_000_000) * pricing.cacheWrite +
    (totalOutput / 1_000_000) * pricing.output;
  const costPart = cost > 0 ? ` | ~$${cost.toFixed(2)}` : "";

  // Only show cache breakdown when the provider reports it
  const cacheParts =
    totalCacheRead || totalCacheWrite
      ? ` cache-r:${fmt(totalCacheRead)} cache-w:${fmt(totalCacheWrite)}`
      : "";

  log(
    `  📊 ${label}: ${elapsed}s | in:${fmt(totalInput)}${cacheParts} out:${fmt(totalOutput)} | ctx:${fmt(totalContextTokens)} [${zoneTag}]${costPart}`,
  );
}

// ---------------------------------------------------------------------------
// QA gate helpers
// ---------------------------------------------------------------------------

function isClean(path: string, passWord: string): boolean {
  if (!existsSync(path)) return true;
  return readFileSync(path, "utf8").trim().startsWith(passWord);
}

// Write a phase marker so the backpressure stop hook knows to skip for
// non-builder phases. The file lives in the worktree (bind-mounted into Docker).
function setPhase(worktree: string, phase: string) {
  writeFileSync(join(worktree, ".sandcastle-phase"), phase);
}

// Archive test-results/ before a phase that runs Playwright, so previous
// round artifacts are preserved for debugging instead of being wiped.
function archiveTestResults(worktree: string, label: string) {
  const src = join(worktree, "test-results");
  if (!existsSync(src)) return;
  // Only archive if non-empty
  try {
    if (readdirSync(src).length === 0) return;
  } catch { return; }
  const dest = join(worktree, `test-results-${label}`);
  execSync(`mv ${JSON.stringify(src)} ${JSON.stringify(dest)}`);
}

// Detect review oscillation: if two consecutive rounds raise the same finding
// (same file AND similar description), the reviewer and fixer are fighting.
// A new finding in the same file is NOT oscillation — it's deeper review.
function findingsOverlap(prev: string, curr: string): boolean {
  interface Finding { file: string; desc: string }
  const extract = (text: string): Finding[] => {
    const findings: Finding[] = [];
    for (const m of text.matchAll(/^- `?(src\/[^\s:]+)[:\s\d-]*\s*[—–-]\s*(.+)/gm)) {
      findings.push({ file: m[1], desc: normalize(m[2]) });
    }
    return findings;
  };
  // Reduce description to bag-of-words for fuzzy comparison
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const similarity = (a: string, b: string): number => {
    const setA = new Set(a.split(" ").filter(w => w.length > 2));
    const setB = new Set(b.split(" ").filter(w => w.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;
    let overlap = 0;
    for (const w of setA) { if (setB.has(w)) overlap++; }
    return overlap / Math.min(setA.size, setB.size);
  };

  const prevFindings = extract(prev);
  const currFindings = extract(curr);
  let matches = 0;
  for (const cf of currFindings) {
    for (const pf of prevFindings) {
      if (cf.file === pf.file && similarity(cf.desc, pf.desc) > 0.5) {
        matches++;
        break;
      }
    }
  }
  // Only flag oscillation when the majority of current findings are repeats
  return currFindings.length > 0 && matches / currFindings.length > 0.5;
}

function escalate(issueId: string, reason: string) {
  execSync(LABEL_TASK_COMMAND.replace("<ID>", issueId));
  execSync(
    COMMENT_TASK_COMMAND.replace("<ID>", issueId).replace(
      "<COMMENT>",
      `${reason} Needs human review.`,
    ),
  );
}

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      branch: z.string(),
      touchesUI: z.boolean(),
      scope: z.string().default("src/**"),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Worktree exclusions — tracked files that agents don't need inside Docker.
// Gitignored files (node_modules, test-results, *.skip*, .beads, etc.) are
// already absent from worktrees. Only tracked files need to be listed here.
// Edit this list to add or remove exclusions.
// ---------------------------------------------------------------------------
const WORKTREE_EXCLUDE = [
  // Human-facing docs — not referenced by any prompt or agent instruction
  "CLAUDE-TEMPLATE.md",
  "SETUP-GUIDE.md",
  "GLOSSARY.md",
  "README.md",
  // IDE agent configs — not used by sandcastle agents
  ".codex/",
  ".cursor/",
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;

// --single: process only the first unblocked issue, then stop.
const SINGLE_MODE = process.argv.includes("--single");

// --verbose: stream full LLM output to log files.
const VERBOSE = process.argv.includes("--verbose");

// --overlay: copy the host's .sandcastle/ into worktrees after creation,
// overlaying uncommitted prompt edits and new files on top of what git provides.
// Useful during sandcastle development — iterate on prompts without committing.
const OVERLAY = process.argv.includes("--overlay");

// ── Agent assignments ──
// Change the model/provider here; stats and pricing follow automatically.
const PLANNER       = claude("claude-opus-4-8");
const IMPLEMENTER   = claude("claude-opus-4-8");
const VISUAL_QA     = claude("claude-sonnet-4-6");
const VISUAL_FIXER  = claude("claude-opus-4-8");
const REVIEWER      = claude("claude-sonnet-4-6");
const CODE_FIXER    = claude("claude-opus-4-8");
const MERGER        = claude("claude-opus-4-8");

// Log and prompt paths — colocated per issue in subdirectories.
// Global steps (planner, merger) go at the logs root.
function logPath(name: string, issueId?: string): string {
  return issueId
    ? `.sandcastle/logs/${issueId}/${name}.log`
    : `.sandcastle/logs/${name}.log`;
}

function promptPath(name: string, issueId?: string): string {
  return issueId
    ? `.sandcastle/logs/${issueId}/${name}.prompt.md`
    : `.sandcastle/logs/${name}.prompt.md`;
}

function loggingConfig(name: string, issueId?: string) {
  if (!VERBOSE) return undefined;
  return {
    type: "file" as const,
    verbose: true,
    path: logPath(name, issueId),
  };
}

// ---------------------------------------------------------------------------
// Prompt expansion — replicate sandcastle's two-stage expansion on the host
// so the exact prompt is saved for inspection and replay.
//
// Stage 1: {{VAR}} substitution (same regex as sandcastle)
// Stage 2: !`cmd` shell expansion (run on host — same git history)
// ---------------------------------------------------------------------------
function expandAndSave(
  promptFile: string,
  promptArgs: Record<string, string>,
  outputPath: string,
): void {
  let prompt = readFileSync(promptFile, "utf8");

  // Stage 1: substitute {{VAR}} placeholders
  prompt = prompt.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) => (key in promptArgs ? promptArgs[key] : match),
  );

  // Stage 2: expand !`cmd` shell expressions
  prompt = prompt.replace(/!`([^`]+)`/g, (_match, cmd) => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 30_000 }).trimEnd();
    } catch {
      return `<!-- shell expansion failed: ${cmd} -->`;
    }
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, prompt);
}

// Issue tracker commands. Sandcastle init sets these per tracker choice:
//   Beads:  "bd show <ID>" / "bd ready --json --label=Sandcastle" / "bd close <ID>"
//   GitHub: "gh issue view <ID>" / "gh issue list ..." / "gh issue close <ID>"
//   Custom: whatever the user configured
const VIEW_TASK_COMMAND = "bd show <ID>";
const LIST_READY_COMMAND = "bd ready --json --label=Sandcastle";
const CLOSE_TASK_COMMAND = 'bd close <ID> --reason="Completed by Sandcastle"';
const COMMENT_TASK_COMMAND = 'bd update <ID> --notes "<COMMENT>"';
const CREATE_BUG_COMMAND = 'bd create --type=bug --label=ready-for-human --title="<TITLE>" --description="<DESCRIPTION>"';
const LABEL_TASK_COMMAND = 'bd label add <ID> ready-for-human';

// ── Warm image: pre-baked deps so containers start in 2-3s ───
// build-warm.sh is idempotent — rebuilds only when deps/beads change.
log("Building warm image...");
const warmImage = execSync("bash .sandcastle/build-warm.sh")
  .toString()
  .trim()
  .split("\n")
  .pop()!;
log(`Warm image ready: ${warmImage}`);

// Lightweight hooks — node_modules and .beads are already in the image.
// Symlink keeps heavy reads off the bind-mount (fast on macOS VirtioFS).
const hooks = {
  sandbox: {
    onSandboxReady: [
      // Remove tracked files agents don't need (see WORKTREE_EXCLUDE above)
      { command: `rm -rf ${WORKTREE_EXCLUDE.map(p => `./${p}`).join(" ")}` },
      { command: "rm -rf ./node_modules && ln -s /warm/node_modules ./node_modules && node -e \"require('rollup')\" || { rm -f ./node_modules && cp -a /warm/node_modules ./node_modules; }" },
      { command: "cp -a /warm/.beads ./.beads && chmod 700 .beads && bd init --reinit-local --non-interactive -q 2>/dev/null; true" },
      // When overlaying, hide the copied files from git so they don't
      // appear as uncommitted changes. Without this, hooks flag the dirty
      // .claude/ files and the agent tries to git-restore them (undoing
      // the overlay). skip-worktree is local — files won't be staged or
      // committed, they're just invisible to git status/diff.
      ...(OVERLAY
        ? [{ command: "git ls-files -z CLAUDE.md AGENTS.md .claude/ .sandcastle/ e2e/ | xargs -0 git update-index --skip-worktree 2>/dev/null; true" }]
        : []),
      { command: "node .claude/hooks/backpressure.mjs --baseline" },
    ],
  },
};

// When overlaying, copy host files into worktrees so uncommitted edits
// (prompts, agent instructions, rules, skills) override what git checked out.
// Without this, worktrees inherit the committed version — which may be stale.
//
// Directories are expanded to individual file paths because cp -R into an
// existing directory nests (rules/ → rules/rules/) instead of replacing.
function expandFiles(paths: string[]): string[] {
  // Files tracked by git — overlay only copies files the worktree already has
  // (or will have after checkout). Uncommitted files (e.g. local-only skills)
  // would fail because their parent directories don't exist in the worktree.
  const tracked = new Set(
    execSync("git ls-files", { encoding: "utf8" }).trim().split("\n"),
  );
  const result: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) {
      for (const entry of readdirSync(p, { withFileTypes: true, recursive: true })) {
        if (entry.isFile()) {
          const full = join(entry.parentPath ?? entry.path, entry.name);
          if (tracked.has(full)) result.push(full);
        }
      }
    } else {
      if (tracked.has(p)) result.push(p);
    }
  }
  return result;
}

const copyToWorktree: string[] = OVERLAY
  ? expandFiles([
      // Sandcastle prompts and scripts (top-level files only, skip subdirs
      // like worktrees/, logs/, .baseline/)
      ...readdirSync(".sandcastle", { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => `.sandcastle/${e.name}`),
      // Agent instruction files — these control implementer behavior and
      // must match the host to avoid stale instructions (e.g. "delegate to
      // visual-qa" vs "the builder does not spawn these itself").
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/rules",
      ".claude/skills",
      ".claude/hooks",
      ".claude/settings.json",
      ".claude/settings.local.json",
      "e2e",
    ])
  : [];

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  log(`=== Iteration ${iteration}/${MAX_ITERATIONS} ===`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (opus, for deeper reasoning) reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  // Pre-expand issue list on the host (tracker DB may not be portable to Docker)
  log("Pre-expanding issue list on host...");
  const readyIssues = execSync(LIST_READY_COMMAND, { encoding: "utf8" }).trim();

  log("Phase 1: Planner starting...");
  const plannerArgs = { READY_ISSUES: readyIssues };
  expandAndSave(".sandcastle/plan-prompt.md", plannerArgs, promptPath("planner"));
  const plan = await timedRun("Planner", PLANNER, {
    hooks,
    sandbox: docker({ imageName: warmImage }),
    name: "planner",
    maxIterations: 1,
    logging: loggingConfig("planner"),
    promptFile: "./.sandcastle/plan-prompt.md",
    promptArgs: plannerArgs,
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });
  let issues = plan.output.issues;

  // In single mode, only process the first issue
  if (SINGLE_MODE && issues.length > 1) {
    log(`Single mode: picking only ${issues[0]!.id}, skipping ${issues.length - 1} other(s).`);
    issues = [issues[0]!];
  }

  if (issues.length === 0) {
    log("No unblocked issues to work on. Exiting.");
    break;
  }

  log(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
  for (const issue of issues) {
    log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + QA Gates
  //
  // For each issue, create a persistent sandbox. The implementer writes
  // code, then two sequential QA gates validate the work:
  //   1. Visual gate (UI tickets only): visual-qa reports → fixer corrects
  //   2. Code review gate: reviewer reports → fixer corrects
  // Each gate loops up to 3 rounds. Findings travel via .qa/ files in the
  // sandbox worktree, readable from the host (bind-mounted).
  //
  // Promise.allSettled means one failing agent doesn't cancel the others.
  // -------------------------------------------------------------------------
  // Pre-expand issue details on the host for each issue
  log("Pre-expanding issue details on host...");
  const issueDetails = new Map<string, string>();
  for (const issue of issues) {
    const cmd = VIEW_TASK_COMMAND.replace("<ID>", issue.id);
    issueDetails.set(issue.id, execSync(cmd, { encoding: "utf8" }).trim());
  }

  // Generate codemaps on the host (Python + repomix available here)
  log("Generating codemaps...");
  const codemaps = new Map<string, string>();
  for (const issue of issues) {
    const scope = issue.scope || "src/**";
    const details = issueDetails.get(issue.id) ?? "";
    const includeTests = /\btest\b/i.test(details) ? "--include-tests" : "";
    const outPath = `/tmp/_codemap_${issue.id}.md`;
    try {
      execSync(
        `python3 codemap-tool/codemap-gen.py "${scope}" ${includeTests} -o ${outPath}`,
        { encoding: "utf8", timeout: 120_000 },
      );
      codemaps.set(issue.id, readFileSync(outPath, "utf8"));
      log(`  Codemap for ${issue.id}: scope="${scope}" ${includeTests || "(no tests)"}`);
    } catch (e) {
      log(`  Codemap generation failed for ${issue.id}, using empty codemap: ${e}`);
      codemaps.set(issue.id, "<!-- codemap generation failed -->");
    }
  }

  log("Phase 2: Execute + QA Gates starting...");
  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      log(`  Creating sandbox for ${issue.id} (${issue.branch})...`);
      // Compute the merge-base on the host so the backpressure hook inside Docker
      // uses the correct starting commit (origin/main inside the warm image can be stale).
      const guardBase = execSync(`git merge-base HEAD main`, { encoding: "utf8" }).trim();
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: docker({ imageName: warmImage, env: { UI_GUARD: "afk", UI_GUARD_BASE: guardBase } }),
        hooks,
        copyToWorktree,
      });

      try {
        // Implement
        log(`  Sandbox ready for ${issue.id}. Implementer starting...`);
        const codingStandards = readFileSync(".sandcastle/CODING_STANDARDS.md", "utf8");
        const implArgs = {
          TASK_ID: issue.id,
          ISSUE_TITLE: issue.title,
          BRANCH: issue.branch,
          ISSUE_DETAILS: issueDetails.get(issue.id)!,
          CODEMAP: codemaps.get(issue.id) ?? "",
          CODING_STANDARDS: codingStandards,
          COMMENT_TASK_COMMAND: COMMENT_TASK_COMMAND.replace("<ID>", issue.id),
          LABEL_TASK_COMMAND: LABEL_TASK_COMMAND.replace("<ID>", issue.id),
          CREATE_BUG_COMMAND: CREATE_BUG_COMMAND,
        };
        expandAndSave(".sandcastle/implement-prompt.md", implArgs, promptPath("implementer", issue.id));
        const impl = await timedSandboxRun(`Implementer [${issue.id}]`, IMPLEMENTER, sandbox, {
          name: "implementer",
          maxIterations: 100,
          logging: loggingConfig("implementer", issue.id),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: implArgs,
        });
        log(`  Implementer done for ${issue.id}. ${impl.commits.length} commit(s).`);

        // QA gates — only if implementer produced commits
        if (impl.commits.length > 0) {
          const MAX_ROUNDS = 3;
          const worktree = `.sandcastle/worktrees/sandcastle-issue-${issue.id}`;

          // ── Visual gate (UI tickets only) ──
          if (issue.touchesUI) {
            for (let round = 1; round <= MAX_ROUNDS; round++) {
              const visualFile = `.qa/visual-r${round}.md`;
              log(`  Visual QA round ${round}/${MAX_ROUNDS} for ${issue.id}...`);
              archiveTestResults(worktree, `visual-qa-r${round}`);
              setPhase(worktree, "visual-qa");
              const vqaArgs = { BRANCH: issue.branch, ISSUE_DETAILS: issueDetails.get(issue.id)!, FINDINGS_FILE: visualFile };
              expandAndSave(".sandcastle/visual-qa-prompt.md", vqaArgs, promptPath(`visual-qa-r${round}`, issue.id));
              await timedSandboxRun(`Visual-QA [${issue.id}] r${round}`, VISUAL_QA, sandbox, {
                name: `visual-qa-r${round}`,
                maxIterations: 10,
                logging: loggingConfig(`visual-qa-r${round}`, issue.id),
                promptFile: "./.sandcastle/visual-qa-prompt.md",
                promptArgs: vqaArgs,
              });

              if (isClean(`${worktree}/${visualFile}`, "PASS")) {
                log(`  Visual QA clean for ${issue.id} after ${round} round(s).`);
                break;
              }

              if (isClean(`${worktree}/${visualFile}`, "DEFER")) {
                log(`  Visual QA deferred for ${issue.id} — only contract gaps. Escalating.`);
                escalate(issue.id, "Visual QA found only contract gaps — no app-side fix possible.");
                break;
              }

              if (round === MAX_ROUNDS) {
                log(`  Visual QA still failing. Escalating ${issue.id}.`);
                escalate(issue.id, "Visual QA loop exhausted after 3 rounds.");
                break;
              }

              log(`  Visual findings detected. Fixer starting...`);
              archiveTestResults(worktree, `visual-fixer-r${round}`);
              setPhase(worktree, "fix");
              const shortId = issue.id.replace(/^.*?-(?=[a-z0-9]+(?:\.[0-9]+)?$)/, '');
              const escapedId = shortId.replace(/\./g, '\\.');
              const vfixArgs = {
                BRANCH: issue.branch,
                TASK_ID: issue.id,
                FINDINGS_FILE: visualFile,
                VERIFY_COMMAND: `npm run ui:qa -- --grep "@visual.*@${escapedId}"`,
              };
              expandAndSave(".sandcastle/fix-prompt.md", vfixArgs, promptPath(`visual-fixer-r${round}`, issue.id));
              await timedSandboxRun(`Visual-Fixer [${issue.id}] r${round}`, VISUAL_FIXER, sandbox, {
                name: `visual-fixer-r${round}`,
                maxIterations: 50,
                logging: loggingConfig(`visual-fixer-r${round}`, issue.id),
                promptFile: "./.sandcastle/fix-prompt.md",
                promptArgs: vfixArgs,
              });
            }
          }

          // ── Code review gate ──
          // Round 1 reviews the full branch diff (main...branch).
          // Round 2+ reviews only the fixer's changes (pre-fixer SHA...branch)
          // so the reviewer doesn't re-discover issues in the original code
          // that it missed in round 1 — guaranteeing convergence.
          let reviewBase = "main";
          let fixHistory = "";
          for (let round = 1; round <= MAX_ROUNDS; round++) {
            const reviewFile = `.qa/review-r${round}.md`;
            log(`  Review round ${round}/${MAX_ROUNDS} for ${issue.id}...`);
            setPhase(worktree, "review");
            const revArgs = {
              BRANCH: issue.branch,
              BASE_BRANCH: reviewBase,
              ISSUE_DETAILS: issueDetails.get(issue.id)!,
              FINDINGS_FILE: reviewFile,
              FIX_HISTORY: fixHistory,
            };
            expandAndSave(".sandcastle/review-prompt.md", revArgs, promptPath(`reviewer-r${round}`, issue.id));
            await timedSandboxRun(`Reviewer [${issue.id}] r${round}`, REVIEWER, sandbox, {
              name: `reviewer-r${round}`,
              maxIterations: 1,
              logging: loggingConfig(`reviewer-r${round}`, issue.id),
              promptFile: "./.sandcastle/review-prompt.md",
              promptArgs: revArgs,
            });

            if (isClean(`${worktree}/${reviewFile}`, "CLEAN")) {
              log(`  Review clean for ${issue.id} after ${round} round(s).`);
              break;
            }

            if (isClean(`${worktree}/${reviewFile}`, "DEFER")) {
              log(`  Review deferred for ${issue.id} — findings need human judgment. Escalating.`);
              escalate(issue.id, "Code review found issues requiring human review.");
              break;
            }

            // Circuit breaker: if round 2+ re-targets the same files as the
            // prior round, the reviewer and fixer are oscillating between
            // conflicting rules. Escalate instead of looping.
            if (round >= 2) {
              const prevFile = `${worktree}/.qa/review-r${round - 1}.md`;
              const currFile = `${worktree}/${reviewFile}`;
              if (existsSync(prevFile) && existsSync(currFile)) {
                const prev = readFileSync(prevFile, "utf8");
                const curr = readFileSync(currFile, "utf8");
                if (findingsOverlap(prev, curr)) {
                  log(`  Oscillation detected for ${issue.id} at round ${round}. Escalating.`);
                  escalate(issue.id,
                    `Review oscillation at round ${round}: findings re-target locations from round ${round - 1}. Needs human tiebreak.`);
                  break;
                }
              }
            }

            if (round === MAX_ROUNDS) {
              log(`  Review still has findings. Escalating ${issue.id}.`);
              escalate(issue.id, "Code review loop exhausted after 3 rounds.");
              break;
            }

            log(`  Review findings detected. Fixer starting...`);
            // Capture branch HEAD before the fixer commits, so the next
            // review round diffs only the fixer's changes.
            reviewBase = execSync(`git rev-parse ${issue.branch}`, { encoding: "utf8" }).trim();
            setPhase(worktree, "fix");
            const cShortId = issue.id.replace(/^.*?-(?=[a-z0-9]+(?:\.[0-9]+)?$)/, '');
            const cEscapedId = cShortId.replace(/\./g, '\\.');
            const cfixArgs = {
              BRANCH: issue.branch,
              TASK_ID: issue.id,
              FINDINGS_FILE: reviewFile,
              VERIFY_COMMAND: `npm run typecheck && npm run lint && npm run test && npx playwright test --grep "@${cEscapedId}" --grep-invert "@visual"`,
            };
            expandAndSave(".sandcastle/fix-prompt.md", cfixArgs, promptPath(`code-fixer-r${round}`, issue.id));
            await timedSandboxRun(`Code-Fixer [${issue.id}] r${round}`, CODE_FIXER, sandbox, {
              name: `code-fixer-r${round}`,
              maxIterations: 50,
              logging: loggingConfig(`code-fixer-r${round}`, issue.id),
              promptFile: "./.sandcastle/fix-prompt.md",
              promptArgs: cfixArgs,
            });

            // Capture fixer disposition for the next reviewer round.
            // Commit messages are naturally compressed (~50-80 tokens).
            try {
              const fixerMsg = execSync(
                `git log -1 --format=%B ${issue.branch}`,
                { encoding: "utf8" },
              ).trim();
              fixHistory += `Round ${round}: ${fixerMsg}\n\n`;
            } catch {
              // No commit from fixer (e.g. CLEAN/DEFER skip) — nothing to record.
            }
          }
        }

        return impl;
      } finally {
        await sandbox.close();
        log(`  Sandbox closed for ${issue.id}.`);
      }
    }),
  );

  // Log any agents that threw (network error, sandbox crash, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      log(`  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`);
    }
  }

  // Only pass branches that actually produced commits to the merge phase.
  // An agent that ran successfully but made no commits has nothing to merge.
  const completedIssues = settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (
        entry,
      ): entry is {
        outcome: PromiseFulfilledResult<
          Awaited<ReturnType<typeof sandcastle.run>>
        >;
        issue: (typeof issues)[number];
      } =>
        entry.outcome.status === "fulfilled" &&
        entry.outcome.value.commits.length > 0,
    )
    .map((entry) => entry.issue);

  const completedBranches = completedIssues.map((i) => i.branch);

  log(`Phase 2 done. ${completedBranches.length} branch(es) with commits:`);
  for (const branch of completedBranches) {
    log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    log("No commits produced. Nothing to merge.");
    if (SINGLE_MODE) {
      log("Single mode: stopping after one issue.");
      break;
    }
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 3: Merge
  //
  // One sonnet agent merges all completed branches into the current branch,
  // resolving any conflicts and running tests to confirm everything still works.
  //
  // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
  // uses to know which branches to merge and which issues to close.
  // -------------------------------------------------------------------------
  log("Phase 3: Merger starting...");
  const mergerArgs = {
    BRANCHES: completedBranches.map((b) => `- ${b}`).join("\n"),
    ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
    CLOSE_TASK_COMMAND: CLOSE_TASK_COMMAND,
  };
  expandAndSave(".sandcastle/merge-prompt.md", mergerArgs, promptPath("merger"));
  await timedRun("Merger", MERGER, {
    hooks,
    sandbox: docker({ imageName: warmImage }),
    name: "merger",
    maxIterations: 1,
    logging: loggingConfig("merger"),
    promptFile: "./.sandcastle/merge-prompt.md",
    promptArgs: mergerArgs,
  });
  log("Phase 3: Merger done. Branches merged.");

  if (SINGLE_MODE) {
    log("Single mode: stopping after one issue.");
    break;
  }
}

log("All done.");

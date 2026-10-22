#!/usr/bin/env node
/**
 * Prompt Eval Runner — universal across all sandcastle prompts
 *
 * Replicates the real sandcastle execution environment:
 *   1. Sets up a temp sandbox with .claude/rules/ (enforcement blocks stripped)
 *   2. Expands the real prompt via {{VAR}} substitution
 *   3. Pipes it to `claude -p` via stdin (same as sandcastle SDK)
 *   4. Checks LLM output against expected violations
 *
 * The LLM sees exactly what it sees in a real sandcastle run:
 *   - Claude Code default system prompt (not overridden)
 *   - .claude/rules/ auto-loaded from the sandbox filesystem (stripped)
 *   - The expanded prompt as the user message
 *
 * Directory layout per prompt:
 *
 *   qa/prompt-evals/{name}/
 *     adjustment.txt    — exact text added to the prompt (stripped for baseline)
 *     vars.json         — default {{VAR}} values for template expansion
 *     supplementary-rules.md — rules pending addition to .claude/rules/
 *     evals/*.jsonl     — eval cases
 *     metrics/*.jsonl   — saved run data
 *
 * ═══════════════════════════════════════════════════════════════════
 * Usage
 * ═══════════════════════════════════════════════════════════════════
 *
 *   node qa/prompt-evals/runner.mjs --prompt implementer             Both modes
 *   node qa/prompt-evals/runner.mjs --prompt implementer --mode baseline
 *   node qa/prompt-evals/runner.mjs --prompt implementer --case SR-01
 *   node qa/prompt-evals/runner.mjs --prompt implementer --tag escape
 *   node qa/prompt-evals/runner.mjs --prompt implementer --model sonnet
 *   node qa/prompt-evals/runner.mjs --prompt implementer --save
 *   node qa/prompt-evals/runner.mjs --prompt implementer --verbose
 *   node qa/prompt-evals/runner.mjs --prompt implementer --dry-run
 */

import { readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, execSync } from "node:child_process";
import { tmpdir } from "node:os";

import { stripEnforcementFences } from "../../.claude/hooks/lib/rules.mjs";

const PROJECT = process.cwd();
const PROMPTS_DIR = join(PROJECT, ".sandcastle", "prompts");
const EVALS_BASE = join(PROJECT, "qa", "prompt-evals");
const RULES_DIR = join(PROJECT, ".claude", "rules");

// ─── CLI ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const promptName = flagValue(args, "--prompt");
const modeFilter = flagValue(args, "--mode");
const caseFilter = flagValue(args, "--case");
const ruleFilter = flagValue(args, "--rule");
const tagFilter = flagValue(args, "--tag");
const model = flagValue(args, "--model") || "sonnet";
const save = args.includes("--save");
const verbose = args.includes("--verbose") || caseFilter != null || ruleFilter != null || tagFilter != null;
const dryRun = args.includes("--dry-run");

if (!promptName) {
  console.error("Usage: runner.mjs --prompt <name> [--mode baseline|adjusted] [--case ID] [--rule RULE] [--tag TAG] [--model MODEL] [--save] [--verbose] [--dry-run]");
  console.error("\nAvailable prompts:");
  try {
    const dirs = readdirSync(EVALS_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "node_modules")
      .map((d) => d.name);
    for (const d of dirs) console.error(`  ${d}`);
  } catch { /* empty */ }
  process.exit(1);
}

function flagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
}

// ─── Paths for the selected prompt ─────────────────────────────────

const PROMPT_FILE = join(PROMPTS_DIR, `${promptName}.prompt.md`);
const PROMPT_DIR = join(EVALS_BASE, promptName);
const ADJUSTMENT_FILE = join(PROMPT_DIR, "adjustment.txt");
const VARS_FILE = join(PROMPT_DIR, "vars.json");
const SUPPLEMENTARY_RULES_FILE = join(PROMPT_DIR, "supplementary-rules.md");
const EVALS_DIR = join(PROMPT_DIR, "evals");
const METRICS_DIR = join(PROMPT_DIR, "metrics");

if (!existsSync(PROMPT_FILE)) { console.error(`Prompt not found: ${PROMPT_FILE}`); process.exit(1); }
if (!existsSync(EVALS_DIR)) { console.error(`Evals not found: ${EVALS_DIR}`); process.exit(1); }

// ─── Load config ───────────────────────────────────────────────────

const adjustmentText = existsSync(ADJUSTMENT_FILE)
  ? readFileSync(ADJUSTMENT_FILE, "utf8").trim()
  : null;

const defaultVars = existsSync(VARS_FILE)
  ? JSON.parse(readFileSync(VARS_FILE, "utf8"))
  : {};

function substituteVars(template, vars) {
  return template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) => (key in vars ? vars[key] : match),
  );
}

// ─── Sandbox setup ─────────────────────────────────────────────────
// Create a temp directory that looks like a project with stripped rules.
// This replicates what the sandbox onSandboxReady hooks do:
//   - git init (so Claude Code recognizes it as a project)
//   - .claude/rules/ with enforcement blocks stripped
//   - supplementary rules copied in

let sandboxDir = null;

function createSandbox() {
  sandboxDir = join(tmpdir(), `prompt-eval-${Date.now()}`);
  const rulesTarget = join(sandboxDir, ".claude", "rules");
  mkdirSync(rulesTarget, { recursive: true });

  // git init so Claude Code recognizes it as a project
  execSync("git init -q", { cwd: sandboxDir });

  // Copy rules with enforcement blocks stripped
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const raw = readFileSync(join(RULES_DIR, f), "utf8");
    writeFileSync(join(rulesTarget, f), stripEnforcementFences(raw));
  }

  // Copy supplementary rules if they exist
  if (existsSync(SUPPLEMENTARY_RULES_FILE)) {
    const raw = readFileSync(SUPPLEMENTARY_RULES_FILE, "utf8");
    writeFileSync(join(rulesTarget, "supplementary.md"), stripEnforcementFences(raw));
  }

  return sandboxDir;
}

function cleanupSandbox() {
  if (sandboxDir && existsSync(sandboxDir)) {
    rmSync(sandboxDir, { recursive: true, force: true });
    sandboxDir = null;
  }
}

// ─── Build the expanded prompt ─────────────────────────────────────

function buildExpandedPrompt(mode, caseVars) {
  let raw = readFileSync(PROMPT_FILE, "utf8");

  // Baseline: strip the adjustment text
  if (mode === "baseline" && adjustmentText) {
    raw = raw.replace(adjustmentText, "").replace(/\n\n\n+/g, "\n\n");
  }

  // Merge per-case var overrides over defaults
  const vars = caseVars ? { ...defaultVars, ...caseVars } : defaultVars;
  return substituteVars(raw, vars);
}

// ─── Load eval cases ───────────────────────────────────────────────

function loadCases() {
  const files = readdirSync(EVALS_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  const cases = [];
  for (const file of files) {
    for (const line of readFileSync(join(EVALS_DIR, file), "utf8").split("\n").filter((l) => l.trim())) {
      try { cases.push(JSON.parse(line)); }
      catch (err) { console.error(`Parse error in ${file}: ${err.message}`); process.exit(1); }
    }
  }
  return cases;
}

function filterCases(cases) {
  let f = cases;
  if (caseFilter) f = f.filter((c) => c.id === caseFilter);
  if (ruleFilter) f = f.filter((c) => c.rule === ruleFilter);
  if (tagFilter) f = f.filter((c) => (c.tags ?? []).includes(tagFilter));
  return f;
}

// ─── Run one case ──────────────────────────────────────────────────

function callClaude(stdinMessage) {
  // Matches sandcastle SDK: claude -p --model MODEL
  // Runs from the sandbox dir so .claude/rules/ auto-load with stripped content.
  // No --system-prompt: Claude Code's default system prompt applies (same as Docker).
  try {
    const result = spawnSync(
      "claude",
      ["-p", "--no-session-persistence", "--model", model],
      { input: stdinMessage, encoding: "utf8", timeout: 300_000, cwd: sandboxDir },
    );
    if (result.error) return { output: "", error: result.error.message.slice(0, 200) };
    if (result.status !== 0 && !result.stdout?.trim()) return { output: "", error: (result.stderr ?? "").trim().slice(0, 200) };
    return { output: (result.stdout ?? "").trim(), error: null };
  } catch (err) {
    return { output: "", error: err.message?.slice(0, 200) ?? "unknown error" };
  }
}

// ─── Deterministic checks on code output ───────────────────────────
// Each check inspects the artifact (the code the LLM wrote), not the
// LLM's opinion. Same principle as T1 hook evals.

function extractCode(output) {
  // Extract code from the largest fenced block, or use the whole output
  const fences = [...output.matchAll(/```(?:tsx?|css|jsx?)?\n([\s\S]*?)```/g)];
  if (fences.length > 0) {
    // Return the largest fence (the main file, not a one-liner example)
    return fences.reduce((a, b) => a[1].length > b[1].length ? a : b)[1];
  }
  // No fences — the output might be raw code
  return output;
}

function runCheck(check, code) {
  if (check.type === "regex_absent") {
    const flags = check.flags || "gm";
    const re = new RegExp(check.pattern, flags);
    const match = re.exec(code);
    return { pass: !match, detail: match ? `Found at offset ${match.index}: ${match[0].slice(0, 80)}` : null };
  }

  if (check.type === "regex_present") {
    const flags = check.flags || "gm";
    const re = new RegExp(check.pattern, flags);
    const match = re.exec(code);
    return { pass: !!match, detail: match ? null : `Pattern not found: ${check.pattern}` };
  }

  if (check.type === "max_consecutive_comment_lines") {
    const lines = code.split("\n");
    let maxRun = 0, run = 0;
    for (const line of lines) {
      if (/^\s*\/\//.test(line)) { run++; maxRun = Math.max(maxRun, run); }
      else { run = 0; }
    }
    const pass = maxRun <= check.max;
    return { pass, detail: pass ? null : `Found ${maxRun} consecutive // lines (max: ${check.max})` };
  }

  return { pass: false, detail: `Unknown check type: ${check.type}` };
}

// ─── Run one case ──────────────────────────────────────────────────

function runCase(c, mode, expandedPrompt) {
  // Create parent dirs for the target file in the sandbox
  if (c.file) {
    const filePath = join(sandboxDir, c.file);
    mkdirSync(join(filePath, ".."), { recursive: true });
  }

  // Two modes:
  // 1. Code-producing agents (implementer, fixer, test-author): "Write file X"
  // 2. Analysis agents (reviewer, plan, visual-qa, merger): raw task, check full output
  const stdinMessage = c.raw_task
    ? `${expandedPrompt}\n\n---\n\n${c.task}`
    : `${expandedPrompt}

---

Write the following file: ${c.file}

Task: ${c.task}

Output ONLY the file content — no explanations, no markdown fences, no other text. Just the raw TypeScript/CSS code.`;

  if (dryRun) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Case: ${c.id} | Mode: ${mode}`);
    console.log(`${"─".repeat(60)}`);
    const idx = expandedPrompt.indexOf("Before committing:");
    if (idx >= 0) {
      console.log("PRE-COMMIT SECTION:");
      console.log(expandedPrompt.slice(idx, idx + 500));
    }
    console.log(`\nTask: ${c.task}`);
    console.log(`Check: ${c.check.description}`);
    console.log(`Sandbox: ${sandboxDir}`);
    return { id: c.id, mode, pass: null, detail: "(dry run)", raw: "(dry run)", duration_ms: 0, error: null };
  }

  const start = performance.now();
  const { output, error } = callClaude(stdinMessage);
  const duration = Math.round(performance.now() - start);

  if (error) return { id: c.id, mode, pass: false, detail: error, raw: output, duration_ms: duration, error };

  // For raw_task cases, check the full output (not code-extracted)
  const code = c.raw_task ? output : extractCode(output);
  const { pass, detail } = runCheck(c.check, code);

  return { id: c.id, mode, pass, detail, raw: output, duration_ms: duration, error: null };
}

// ─── Reporting ─────────────────────────────────────────────────────

function report(cases, results) {
  const sep = "═".repeat(68);
  const thin = "─".repeat(68);
  const modes = [...new Set(results.map((r) => r.mode))].sort();
  const date = new Date().toISOString().slice(0, 10);

  console.log("");
  console.log(sep);
  console.log(`  Prompt Eval: ${promptName}.prompt.md`);
  console.log(`  ${date} | model: ${model}`);
  console.log(sep);

  const byCase = new Map();
  for (const r of results) {
    if (!byCase.has(r.id)) byCase.set(r.id, {});
    byCase.get(r.id)[r.mode] = r;
  }

  let bMiss = 0, bCatch = 0, aCatch = 0, aMiss = 0;
  let cPassB = 0, cPassA = 0, cFailB = 0, cFailA = 0;
  let flipped = 0;

  console.log("");
  console.log("  RESULTS");
  console.log(thin);
  console.log(`  ${"ID".padEnd(8)} ${"Expect".padEnd(7)} ${"Baseline".padEnd(10)} ${"Adjusted".padEnd(10)} ${"Delta".padEnd(10)} Description`);
  console.log(thin);

  for (const c of cases) {
    const e = byCase.get(c.id) ?? {};
    const bR = e.baseline, aR = e.adjusted;
    const bL = bR ? (bR.pass ? "PASS" : "FAIL") : "—";
    const aL = aR ? (aR.pass ? "PASS" : "FAIL") : "—";

    let delta = "—";
    if (bR && aR) {
      if (!bR.pass && aR.pass) { delta = "FLIPPED"; flipped++; }
      else if (bR.pass && aR.pass) delta = "both ok";
      else if (!bR.pass && !aR.pass) delta = "both fail";
      else delta = "REGRESS";
    }

    const isControl = c.expect_clean === true;
    if (!isControl) {
      if (bR?.pass) bCatch++; else if (bR) bMiss++;
      if (aR?.pass) aCatch++; else if (aR) aMiss++;
    } else {
      if (bR?.pass) cPassB++; else if (bR) cFailB++;
      if (aR?.pass) cPassA++; else if (aR) cFailA++;
    }

    const type = isControl ? "ctrl" : "check";
    const mark = delta === "FLIPPED" ? "+" : delta === "REGRESS" ? "!" : delta === "both fail" ? "-" : " ";
    console.log(`${mark} ${c.id.padEnd(8)} ${type.padEnd(7)} ${bL.padEnd(10)} ${aL.padEnd(10)} ${delta.padEnd(10)} ${c.description}`);

    if (verbose) {
      for (const m of modes) {
        const r = e[m]; if (!r) continue;
        if (r.error) console.log(`           ${m.padEnd(10)} ERROR: ${r.error.slice(0, 80)}`);
        else if (!r.pass && r.detail) console.log(`           ${m.padEnd(10)} FAIL: ${r.detail}`);
        else console.log(`           ${m.padEnd(10)} check passed`);
        if (r.raw && r.raw !== "(dry run)") console.log(`           ${m.padEnd(10)} CODE: ${extractCode(r.raw).slice(0, 150).replace(/\n/g, "\\n")}`);
      }
    }
  }

  const checkCases = cases.filter((c) => !c.expect_clean);
  const controlCases = cases.filter((c) => c.expect_clean);

  console.log(""); console.log("  SUMMARY"); console.log(thin);
  console.log("  PASS = the LLM's code passed the deterministic check (avoided the violation)");
  console.log("");
  if (modes.length === 2) {
    console.log(`  Violation cases (${checkCases.length}): baseline ${bCatch}/${checkCases.length}, adjusted ${aCatch}/${checkCases.length}, flipped ${flipped}/${checkCases.length}`);
    console.log(`  Control cases (${controlCases.length}): baseline ${cPassB}/${controlCases.length}, adjusted ${cPassA}/${controlCases.length}`);
    console.log("");
    if (aMiss === 0 && cFailA === 0) console.log("  VERDICT: ALL CLEAR");
    else if (flipped > 0 && cFailA === 0) console.log(`  VERDICT: IMPROVEMENT — ${flipped} flipped, ${aMiss} still missed`);
    else if (cFailA > 0) console.log(`  VERDICT: FALSE POSITIVES — ${cFailA} control(s) failed`);
    else console.log("  VERDICT: NO IMPROVEMENT");
  } else {
    const m = modes[0];
    const catches = m === "baseline" ? bCatch : aCatch;
    const cPass = m === "baseline" ? cPassB : cPassA;
    console.log(`  Mode: ${m} | Checks passed: ${catches}/${checkCases.length} | Controls: ${cPass}/${controlCases.length}`);
  }
  console.log(""); console.log(sep);

  return { flipped, bCatch, bMiss, aCatch, aMiss, cPassB, cPassA, cFailB, cFailA };
}

function saveMetrics(results, summary) {
  mkdirSync(METRICS_DIR, { recursive: true });
  const file = join(METRICS_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const ts = new Date().toISOString();
  const runId = `run-${Date.now()}`;
  for (const r of results) appendFileSync(file, JSON.stringify({ type: "case", timestamp: ts, run_id: runId, model, prompt: promptName, ...r }) + "\n");
  appendFileSync(file, JSON.stringify({ type: "summary", timestamp: ts, run_id: runId, model, prompt: promptName, ...summary }) + "\n");
  return { file, runId };
}

// ─── Main ──────────────────────────────────────────────────────────

const cases = filterCases(loadCases());
if (cases.length === 0) { console.log("No eval cases match the filter."); process.exit(0); }

const modes = modeFilter ? [modeFilter] : ["baseline", "adjusted"];

// Set up the sandbox once — reused across all cases and modes
console.log("Setting up sandbox...");
createSandbox();
console.log(`  Sandbox: ${sandboxDir}`);
console.log(`  Rules: ${readdirSync(join(sandboxDir, ".claude", "rules")).join(", ")}`);

// Pre-build expanded prompts (one per mode).
// Cases without per-case vars share the default expansion.
// Cases WITH per-case vars get a fresh expansion at runtime.
const defaultExpandedPrompts = {};
for (const mode of modes) defaultExpandedPrompts[mode] = buildExpandedPrompt(mode);

const results = [];

try {
  for (const mode of modes) {
    console.log(`\nRunning ${cases.length} cases in ${mode} mode (model: ${model})...`);
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      process.stdout.write(`  [${i + 1}/${cases.length}] ${c.id} ...`);
      const expandedPrompt = c.vars
        ? buildExpandedPrompt(mode, c.vars)
        : defaultExpandedPrompts[mode];
      const result = runCase(c, mode, expandedPrompt);
      results.push(result);
      if (!dryRun) {
        const label = result.pass ? "PASS" : result.error ? "ERROR" : "FAIL";
        process.stdout.write(` ${label} (${result.duration_ms}ms)\n`);
      } else {
        process.stdout.write(" (dry run)\n");
      }
    }
  }

  if (!dryRun) {
    const summary = report(cases, results);
    if (save) {
      const { file, runId } = saveMetrics(results, summary);
      console.log(`Metrics saved: ${file} (run: ${runId})\n`);
    }
  }
} finally {
  cleanupSandbox();
  console.log("Sandbox cleaned up.");
}

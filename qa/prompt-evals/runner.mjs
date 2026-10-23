#!/usr/bin/env node
/**
 * Prompt Eval Runner — ratchet model
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
 *     vars.json         — default {{VAR}} values for template expansion
 *     evals/*.jsonl     — eval cases
 *     metrics/
 *       baseline.json   — best scoring run
 *       runs/<ts>.json  — every run
 *       inspect/        — generated markdown files
 *
 * ═══════════════════════════════════════════════════════════════════
 * Usage
 * ═══════════════════════════════════════════════════════════════════
 *
 *   node qa/prompt-evals/runner.mjs --prompt implementer             Run all
 *   node qa/prompt-evals/runner.mjs --prompt implementer --case SR-01
 *   node qa/prompt-evals/runner.mjs --prompt implementer --rule X
 *   node qa/prompt-evals/runner.mjs --prompt implementer --tag escape
 *   node qa/prompt-evals/runner.mjs --prompt implementer --save
 *   node qa/prompt-evals/runner.mjs --prompt implementer --save --force
 *   node qa/prompt-evals/runner.mjs --prompt implementer --baseline
 *   node qa/prompt-evals/runner.mjs --prompt implementer --inspect RQD-01
 *   node qa/prompt-evals/runner.mjs --prompt implementer --verbose
 *   node qa/prompt-evals/runner.mjs --prompt implementer --dry-run
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
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
const caseFilter = flagValue(args, "--case");
const ruleFilter = flagValue(args, "--rule");
const tagFilter = flagValue(args, "--tag");
const inspectCase = flagValue(args, "--inspect");
const model = flagValue(args, "--model") || "sonnet";
const save = args.includes("--save");
const force = args.includes("--force");
const showBaseline = args.includes("--baseline");
const verbose = args.includes("--verbose") || caseFilter != null || ruleFilter != null || tagFilter != null;
const dryRun = args.includes("--dry-run");

if (!promptName) {
  console.error("Usage: runner.mjs --prompt <name> [--case ID] [--rule RULE] [--tag TAG] [--model MODEL] [--save] [--force] [--baseline] [--inspect CASE] [--verbose] [--dry-run]");
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
const VARS_FILE = join(PROMPT_DIR, "vars.json");
const EVALS_DIR = join(PROMPT_DIR, "evals");
const METRICS_DIR = join(PROMPT_DIR, "metrics");
const BASELINE_FILE = join(METRICS_DIR, "baseline.json");
const RUNS_DIR = join(METRICS_DIR, "runs");
const INSPECT_DIR = join(METRICS_DIR, "inspect");

if (!existsSync(PROMPT_FILE)) { console.error(`Prompt not found: ${PROMPT_FILE}`); process.exit(1); }
if (!existsSync(EVALS_DIR)) { console.error(`Evals not found: ${EVALS_DIR}`); process.exit(1); }

// ─── Load config ───────────────────────────────────────────────────

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

let sandboxDir = null;

function createSandbox() {
  sandboxDir = join(tmpdir(), `prompt-eval-${Date.now()}`);
  const rulesTarget = join(sandboxDir, ".claude", "rules");
  mkdirSync(rulesTarget, { recursive: true });

  // git init so Claude Code recognizes it as a project
  execSync("git init -q", { cwd: sandboxDir });

  // Mock git so the model can't commit, push, or trigger credential prompts.
  // The mock exits 0 for status/diff (Claude Code housekeeping) and no-ops everything else.
  const mockBin = join(sandboxDir, ".mock-bin");
  mkdirSync(mockBin, { recursive: true });
  writeFileSync(join(mockBin, "git"), `#!/bin/sh
# Mock git for prompt evals — prevents real commits and credential prompts
case "$1" in
  status|diff|log|rev-parse|config|branch|show-ref|ls-files|remote) exec /usr/bin/git "$@" ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 });

  // Copy rules with enforcement blocks stripped
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const raw = readFileSync(join(RULES_DIR, f), "utf8");
    writeFileSync(join(rulesTarget, f), stripEnforcementFences(raw));
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

function buildExpandedPrompt(caseVars) {
  const raw = readFileSync(PROMPT_FILE, "utf8");
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

// ─── Resolve checks for a case ────────────────────────────────────
// Backward compat: `check` (singular) → wrapped as `checks: [check]`
// New format: `checks` array with optional `metric` per check

function resolveChecks(c) {
  if (c.checks && Array.isArray(c.checks)) return c.checks;
  if (c.check) return [c.check];
  return [];
}

// Returns true if the case uses the new multi-check format with metrics
function caseUsesMetrics(c) {
  const checks = resolveChecks(c);
  return checks.some((ch) => ch.metric);
}

// ─── Run one case ──────────────────────────────────────────────────

function callClaude(stdinMessage) {
  // Matches sandcastle SDK: claude -p --model MODEL --dangerously-skip-permissions
  // Runs from the sandbox dir so .claude/rules/ auto-load with stripped content.
  // Permissions skipped so the model can use Write/Edit tools (same as Docker sandbox).
  try {
    const result = spawnSync(
      "claude",
      ["-p", "--no-session-persistence", "--dangerously-skip-permissions",
       "--allowedTools", "Write,Edit,Read,Glob,Grep",
       "--model", model],
      { input: stdinMessage, encoding: "utf8", timeout: 600_000, cwd: sandboxDir,
        env: { ...process.env, PATH: `${join(sandboxDir, ".mock-bin")}:${process.env.PATH}` } },
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

function runCase(c, expandedPrompt) {
  // Create parent dirs for the target file in the sandbox
  if (c.file) {
    const filePath = join(sandboxDir, c.file);
    mkdirSync(dirname(filePath), { recursive: true });
  }

  // Two modes:
  // 1. Code-producing agents (implementer, fixer, test-author): prompt + task,
  //    model uses Write/Edit tools (same as sandcastle Docker). Check the file on disk.
  // 2. Analysis agents (reviewer, plan, visual-qa, merger): prompt + task,
  //    check stdout (they produce verdicts as text).
  const stdinMessage = c.raw_task
    ? `${expandedPrompt}\n\n---\n\n${c.task}`
    : `${expandedPrompt}\n\n---\n\nTask: ${c.task}\n\nWrite the file: ${c.file}`;

  const checks = resolveChecks(c);

  if (dryRun) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Case: ${c.id}`);
    console.log(`${"─".repeat(60)}`);
    const idx = expandedPrompt.indexOf("Before committing:");
    if (idx >= 0) {
      console.log("PRE-COMMIT SECTION:");
      console.log(expandedPrompt.slice(idx, idx + 500));
    }
    console.log(`\nTask: ${c.task}`);
    for (const ch of checks) {
      console.log(`Check: ${ch.description}${ch.metric ? ` [${ch.metric}]` : ""}`);
    }
    console.log(`Sandbox: ${sandboxDir}`);
    return {
      id: c.id,
      pass: null,
      checkResults: checks.map((ch) => ({
        metric: ch.metric || null,
        pass: null,
        detail: "(dry run)",
        description: ch.description || "",
      })),
      raw: "(dry run)",
      code: "(dry run)",
      duration_ms: 0,
      error: null,
    };
  }

  const start = performance.now();
  const { output, error } = callClaude(stdinMessage);
  const duration = Math.round(performance.now() - start);

  if (error) {
    return {
      id: c.id,
      pass: false,
      checkResults: checks.map((ch) => ({
        metric: ch.metric || null,
        pass: false,
        detail: error,
        description: ch.description || "",
      })),
      raw: output,
      code: "",
      duration_ms: duration,
      error,
    };
  }

  // For raw_task cases, check stdout. For code cases, read the file from disk
  // (the model used Write/Edit tools). Fall back to extracting from stdout.
  let code;
  if (c.raw_task) {
    code = output;
  } else if (c.file) {
    const filePath = join(sandboxDir, c.file);
    try {
      code = readFileSync(filePath, "utf8");
    } catch {
      // File wasn't written — fall back to stdout extraction
      code = extractCode(output);
    }
  } else {
    code = extractCode(output);
  }

  const checkResults = [];
  for (const ch of checks) {
    const { pass, detail } = runCheck(ch, code);
    checkResults.push({
      metric: ch.metric || null,
      pass,
      detail,
      description: ch.description || "",
    });
  }

  const allPass = checkResults.every((cr) => cr.pass);

  return {
    id: c.id,
    pass: allPass,
    checkResults,
    raw: output,
    code,
    duration_ms: duration,
    error: null,
  };
}

// ─── Baseline ─────────────────────────────────────────────────────

function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return null;
  try { return JSON.parse(readFileSync(BASELINE_FILE, "utf8")); }
  catch { return null; }
}

function loadLatestRun() {
  if (!existsSync(RUNS_DIR)) return null;
  const files = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(join(RUNS_DIR, files[files.length - 1]), "utf8")); }
  catch { return null; }
}

// ─── Build run data ───────────────────────────────────────────────

function buildRunData(cases, results) {
  const ts = new Date().toISOString();
  const runId = `run-${Date.now()}`;

  const caseResults = [];
  const artifacts = {};
  const byRule = {};
  // metric → { pass: Set<caseId>, total: Set<caseId> }
  const metricSets = {};

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const r = results[i];
    const isControl = c.expect_clean === true;
    const ruleKey = isControl ? "[ctrl]" : c.rule;

    caseResults.push({
      id: c.id,
      rule: ruleKey,
      pass: r.pass,
      checkResults: r.checkResults,
      detail: r.checkResults?.find((cr) => !cr.pass)?.detail ?? null,
      duration_ms: r.duration_ms,
    });

    artifacts[c.id] = {
      prompt_excerpt: c.task?.slice(0, 500) ?? "",
      output: r.raw,
      code: r.code,
    };

    // by_rule aggregation (backward compat)
    if (!byRule[ruleKey]) byRule[ruleKey] = { pass: 0, total: 0, rate: 0 };
    byRule[ruleKey].total++;
    if (r.pass) byRule[ruleKey].pass++;

    // per-metric aggregation
    // Group checks by metric for this case, then: case passes a metric if ALL checks
    // for that metric passed.
    if (r.checkResults) {
      const byMetricForCase = {};
      for (const cr of r.checkResults) {
        if (cr.metric) {
          if (!byMetricForCase[cr.metric]) byMetricForCase[cr.metric] = [];
          byMetricForCase[cr.metric].push(cr);
        }
      }
      for (const [metric, crs] of Object.entries(byMetricForCase)) {
        if (!metricSets[metric]) metricSets[metric] = { pass: 0, total: 0 };
        metricSets[metric].total++;
        if (crs.every((cr) => cr.pass)) metricSets[metric].pass++;
      }
    }
  }

  // Compute rates for by_rule
  for (const key of Object.keys(byRule)) {
    byRule[key].rate = byRule[key].total > 0 ? Math.round((byRule[key].pass / byRule[key].total) * 100) : 0;
  }

  // Build metrics object with rates
  const metrics = {};
  for (const [metric, data] of Object.entries(metricSets)) {
    metrics[metric] = {
      pass: data.pass,
      total: data.total,
      rate: data.total > 0 ? Math.round((data.pass / data.total) * 100) : 0,
    };
  }

  const total = caseResults.length;
  const score = caseResults.filter((c) => c.pass).length;
  const passRate = total > 0 ? Math.round((score / total) * 100) : 0;

  const controls = byRule["[ctrl]"] ?? { pass: 0, total: 0 };

  return {
    score,
    total,
    pass_rate: passRate,
    metrics,
    by_rule: byRule,
    cases: caseResults,
    controls: { pass: controls.pass, total: controls.total },
    model,
    timestamp: ts,
    run_id: runId,
    artifacts,
  };
}

// ─── Reporting ─────────────────────────────────────────────────────

function bar(rate, width) {
  const filled = Math.round((rate / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function report(runData, baseline) {
  const sep = "══════════════════════════════════════════════════════════════";
  const thin = "  " + "─".repeat(59);
  const date = runData.timestamp.slice(0, 10);

  console.log("");
  console.log(sep);
  console.log(`  ${promptName} evals │ ${date} │ ${model} │ ${runData.total} cases`);
  console.log(sep);
  console.log("");

  // Score line
  const currentStr = `${runData.score}/${runData.total} (${runData.pass_rate}%)`;
  const baselineStr = baseline
    ? `${baseline.score}/${baseline.total} (${baseline.pass_rate}%)`
    : "—";
  const deltaStr = baseline
    ? `${runData.pass_rate >= baseline.pass_rate ? "+" : ""}${runData.pass_rate - baseline.pass_rate}%`
    : "";

  process.stdout.write(`  SCORE   ${currentStr}`);
  process.stdout.write(`        baseline  ${baselineStr}`);
  if (deltaStr) process.stdout.write(`        \u0394 ${deltaStr}`);
  console.log("");
  console.log("");

  // Determine which sections to show
  const hasMetrics = Object.keys(runData.metrics).length > 0;
  const hasLegacyCases = runData.cases.some((c) => {
    const evalCase = _allCases.find((ec) => ec.id === c.id);
    return evalCase && !caseUsesMetrics(evalCase);
  });

  // METRICS section (new format)
  if (hasMetrics) {
    console.log("  METRICS                                    now     base");
    console.log(thin);

    for (const [metric, md] of Object.entries(runData.metrics)) {
      const bd = baseline?.metrics?.[metric];
      const nowStr = `${md.rate}%`.padStart(4);
      const baseStr = bd ? `${bd.rate}%`.padStart(4) : "   —";
      const countStr = `${md.pass}/${md.total}`;
      const label = metric.replace(/_/g, " ");
      const capitalLabel = label.charAt(0).toUpperCase() + label.slice(1);
      console.log(`  ${capitalLabel.padEnd(30)} ${bar(md.rate, 12)}  ${countStr.padEnd(5)} ${nowStr}  ${baseStr}`);
    }

    console.log("");
  }

  // BY RULE section (old format — shown if any cases use old format)
  if (hasLegacyCases) {
    const ruleKeys = Object.keys(runData.by_rule).filter((k) => k !== "[ctrl]");
    const hasCtrl = "[ctrl]" in runData.by_rule;

    console.log("  BY RULE                                        now     base");
    console.log(thin);

    for (const rule of ruleKeys) {
      const rd = runData.by_rule[rule];
      const bd = baseline?.by_rule?.[rule];
      const nowStr = `${rd.rate}%`.padStart(4);
      const baseStr = bd ? `${bd.rate}%`.padStart(4) : "   —";
      const countStr = `${rd.pass}/${rd.total}`;
      console.log(`  ${rule.padEnd(30)} ${bar(rd.rate, 12)}  ${countStr.padEnd(5)} ${nowStr}  ${baseStr}`);
    }

    if (hasCtrl) {
      const rd = runData.by_rule["[ctrl]"];
      const bd = baseline?.by_rule?.["[ctrl]"];
      const nowStr = `${rd.rate}%`.padStart(4);
      const baseStr = bd ? `${bd.rate}%`.padStart(4) : "   —";
      const countStr = `${rd.pass}/${rd.total}`;
      console.log(`  ${"[ctrl]".padEnd(30)} ${bar(rd.rate, 12)}  ${countStr.padEnd(5)} ${nowStr}  ${baseStr}`);
    }

    console.log("");
  }

  // Cases
  console.log("  CASES");
  console.log(thin);

  for (const c of runData.cases) {
    const mark = c.pass ? "\u2713" : "\u2717";
    const desc = findCaseDescription(c.id);
    const checkResults = c.checkResults || [];
    const totalChecks = checkResults.length;
    const passedChecks = checkResults.filter((cr) => cr.pass).length;

    // Show check count if there are multiple checks
    const checkCountStr = totalChecks > 1 ? ` (${passedChecks}/${totalChecks} checks)` : "";
    const line = `  ${mark}  ${c.id.padEnd(8)} ${desc}${checkCountStr}`;
    console.log(line);

    if (!c.pass) {
      // Show each failed check with metric name and detail
      const failedChecks = checkResults.filter((cr) => !cr.pass);
      for (const fc of failedChecks) {
        const metricLabel = fc.metric ? `${fc.metric}: ` : "";
        if (fc.detail) {
          console.log(`             ${metricLabel}${fc.detail}`);
        }
      }
    }

    // In verbose mode, show ALL check results for ALL cases
    if (verbose && c.pass) {
      for (const cr of checkResults) {
        const metricLabel = cr.metric ? `[${cr.metric}] ` : "";
        const resultMark = cr.pass ? "\u2713" : "\u2717";
        console.log(`             ${resultMark} ${metricLabel}${cr.description}`);
      }
    }
  }

  console.log(thin);
  console.log("");

  // Footer
  if (baseline) {
    const bDate = baseline.timestamp.slice(0, 10);
    console.log(`  baseline: ${bDate} │ ${baseline.score}/${baseline.total} (${baseline.pass_rate}%) │ ${baseline.model}`);
  } else {
    console.log("  no baseline yet");
  }
}

// We need case descriptions available for reporting
let _allCases = [];
function findCaseDescription(id) {
  const c = _allCases.find((c) => c.id === id);
  if (!c) return "";
  const isControl = c.expect_clean === true;
  return isControl ? `[ctrl] ${c.description}` : c.description;
}

// ─── Inspect mode ─────────────────────────────────────────────────

function handleInspect(caseId) {
  // --inspect X --baseline → inspect from baseline; otherwise from latest run
  const source = showBaseline ? loadBaseline() : loadLatestRun();
  const sourceLabel = showBaseline ? "baseline" : "latest run";
  if (!source) {
    console.error(`No ${sourceLabel} found. Run evals first.`);
    process.exit(1);
  }

  const caseData = source.cases?.find((c) => c.id === caseId);
  if (!caseData) {
    console.error(`Case ${caseId} not found in ${sourceLabel}.`);
    process.exit(1);
  }

  const artifact = source.artifacts?.[caseId];
  if (!artifact) {
    console.error(`No artifacts found for case ${caseId}. ${showBaseline ? "Baseline was saved without artifacts (promoted before this feature). Re-run and --save to update." : ""}`);
    process.exit(1);
  }

  // Find the eval case for metadata
  const allCases = loadCases();
  const evalCase = allCases.find((c) => c.id === caseId);
  if (!evalCase) {
    console.error(`Eval case ${caseId} not found in evals.`);
    process.exit(1);
  }

  const result = caseData.pass ? "\u2713 PASS" : "\u2717 FAIL";
  const duration = (caseData.duration_ms / 1000).toFixed(1);

  // Build checks table if checkResults are available
  const checkResults = caseData.checkResults || [];
  let checksSection;

  if (checkResults.length > 0) {
    const rows = checkResults.map((cr) => {
      const metricLabel = cr.metric || "(none)";
      const resultStr = cr.pass
        ? "\u2713 PASS"
        : `\u2717 FAIL — ${cr.detail || ""}`;
      return `| ${metricLabel} | ${cr.description} | ${resultStr} |`;
    });

    checksSection = `## Checks

| Metric | Check | Result |
|---|---|---|
${rows.join("\n")}`;
  } else {
    // Legacy fallback: single check display
    const checks = resolveChecks(evalCase);
    const ch = checks[0];
    let checkResult;
    if (ch?.type === "regex_absent") {
      checkResult = caseData.pass
        ? `\u2713 Pattern not found — PASS`
        : `\u2717 ${caseData.detail} — FAIL`;
    } else if (ch?.type === "regex_present") {
      checkResult = caseData.pass
        ? `\u2713 Pattern found — PASS`
        : `\u2717 ${caseData.detail} — FAIL`;
    } else {
      checkResult = caseData.pass
        ? `\u2713 Check passed — PASS`
        : `\u2717 ${caseData.detail} — FAIL`;
    }

    checksSection = `## Check

- **Type:** ${ch?.type ?? "unknown"}
- **Pattern:** \`${ch?.pattern || ch?.max || ""}\`
- **Result:** ${checkResult}`;
  }

  const md = `# ${caseId} — ${evalCase.description}

**Result:** ${result}
**Rule:** ${caseData.rule}
**Duration:** ${duration}s
**Model:** ${source.model}
**Source:** ${sourceLabel}

## Task

${evalCase.task}

## Output

\`\`\`tsx
${artifact.code || artifact.output}
\`\`\`

${checksSection}
`;

  mkdirSync(INSPECT_DIR, { recursive: true });
  const outPath = join(INSPECT_DIR, `${caseId}.md`);
  writeFileSync(outPath, md);
  console.log(`Inspect written: ${outPath}`);

  // Try to open in VS Code
  try {
    execSync(`code "${outPath}"`, { stdio: "ignore" });
  } catch {
    // code not available, just printed the path
  }
}

// ─── Show baseline ────────────────────────────────────────────────

function handleShowBaseline() {
  const baseline = loadBaseline();
  if (!baseline) {
    console.log("No baseline found.");
    process.exit(0);
  }

  const sep = "══════════════════════════════════════════════════════════════";
  const thin = "  " + "─".repeat(59);
  const date = baseline.timestamp.slice(0, 10);

  console.log("");
  console.log(sep);
  console.log(`  ${promptName} baseline │ ${date} │ ${baseline.model} │ ${baseline.total} cases`);
  console.log(sep);
  console.log("");
  console.log(`  SCORE   ${baseline.score}/${baseline.total} (${baseline.pass_rate}%)`);
  console.log("");

  // METRICS section
  if (baseline.metrics && Object.keys(baseline.metrics).length > 0) {
    console.log("  METRICS                                    rate");
    console.log(thin);

    for (const [metric, data] of Object.entries(baseline.metrics)) {
      const rateStr = `${data.rate}%`.padStart(4);
      const countStr = `${data.pass}/${data.total}`;
      const label = metric.replace(/_/g, " ");
      const capitalLabel = label.charAt(0).toUpperCase() + label.slice(1);
      console.log(`  ${capitalLabel.padEnd(30)} ${bar(data.rate, 12)}  ${countStr.padEnd(5)} ${rateStr}`);
    }

    console.log("");
  }

  // BY RULE section
  console.log("  BY RULE                                        rate");
  console.log(thin);

  for (const [rule, data] of Object.entries(baseline.by_rule)) {
    const rateStr = `${data.rate}%`.padStart(4);
    const countStr = `${data.pass}/${data.total}`;
    console.log(`  ${rule.padEnd(30)} ${bar(data.rate, 12)}  ${countStr.padEnd(5)} ${rateStr}`);
  }

  console.log("");

  console.log("  CASES");
  console.log(thin);

  for (const c of baseline.cases) {
    const mark = c.pass ? "\u2713" : "\u2717";
    const checkResults = c.checkResults || [];
    const totalChecks = checkResults.length;
    const passedChecks = checkResults.filter((cr) => cr.pass).length;
    const checkCountStr = totalChecks > 1 ? ` (${passedChecks}/${totalChecks} checks)` : "";
    console.log(`  ${mark}  ${c.id.padEnd(8)} ${c.rule}${checkCountStr}`);
    if (!c.pass) {
      const failedChecks = checkResults.filter((cr) => !cr.pass);
      for (const fc of failedChecks) {
        const metricLabel = fc.metric ? `${fc.metric}: ` : "";
        if (fc.detail) {
          console.log(`             ${metricLabel}${fc.detail}`);
        }
      }
      // Legacy fallback for cases without checkResults
      if (failedChecks.length === 0 && c.detail) {
        console.log(`             ${c.detail}`);
      }
    }
  }

  console.log(thin);
  console.log(sep);
}

// ─── Save / Promote ───────────────────────────────────────────────

function saveRun(runData) {
  mkdirSync(RUNS_DIR, { recursive: true });
  const runFile = join(RUNS_DIR, `${runData.timestamp.replace(/[:.]/g, "-")}.json`);
  writeFileSync(runFile, JSON.stringify(runData, null, 2));
  return runFile;
}

function promoteBaseline(runData, baseline) {
  // Keep artifacts in baseline so --inspect --baseline works
  const baselineData = runData;

  if (!baseline) {
    mkdirSync(METRICS_DIR, { recursive: true });
    writeFileSync(BASELINE_FILE, JSON.stringify(baselineData, null, 2));
    console.log("  \u2B06 PROMOTED (first baseline)");
    return;
  }

  if (force) {
    writeFileSync(BASELINE_FILE, JSON.stringify(baselineData, null, 2));
    console.log("  \u2B06 PROMOTED (--force)");
    return;
  }

  // Check for metric regressions
  const hasMetrics = Object.keys(runData.metrics).length > 0;
  const baselineHasMetrics = baseline.metrics && Object.keys(baseline.metrics).length > 0;

  if (hasMetrics && baselineHasMetrics) {
    // Per-metric promotion: no metric may regress, at least one must improve (or all stable)
    let anyRegressed = false;
    let anyImproved = false;

    for (const [metric, current] of Object.entries(runData.metrics)) {
      const base = baseline.metrics[metric];
      if (!base) continue; // new metric, not a regression
      if (current.rate < base.rate) anyRegressed = true;
      if (current.rate > base.rate) anyImproved = true;
    }

    if (anyRegressed) {
      console.log(`  \u2B07 REGRESSED — baseline kept (metric regression detected; run with --save --force to override)`);
      return;
    }

    // Promote: improved or stable
    writeFileSync(BASELINE_FILE, JSON.stringify(baselineData, null, 2));
    if (anyImproved) {
      console.log("  \u2B06 PROMOTED (--save)");
    } else {
      console.log("  \u2B06 PROMOTED (--save, stable)");
    }
  } else {
    // Legacy promotion: overall pass rate
    if (runData.pass_rate >= baseline.pass_rate) {
      writeFileSync(BASELINE_FILE, JSON.stringify(baselineData, null, 2));
      console.log("  \u2B06 PROMOTED (--save)");
    } else {
      console.log(`  \u2B07 REGRESSED — baseline kept (run with --save --force to override)`);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────

// Handle --inspect mode
if (inspectCase) {
  _allCases = loadCases();
  handleInspect(inspectCase);
  process.exit(0);
}

// Handle --baseline mode
if (showBaseline) {
  handleShowBaseline();
  process.exit(0);
}

const allCases = loadCases();
_allCases = allCases;
const cases = filterCases(allCases);
if (cases.length === 0) { console.log("No eval cases match the filter."); process.exit(0); }

// Set up the sandbox once — reused across all cases
console.log("Setting up sandbox...");
createSandbox();
console.log(`  Sandbox: ${sandboxDir}`);
console.log(`  Rules: ${readdirSync(join(sandboxDir, ".claude", "rules")).join(", ")}`);

// Pre-build expanded prompt (cases without per-case vars share the default expansion).
const defaultExpandedPrompt = buildExpandedPrompt();

const results = [];

try {
  console.log(`\nRunning ${cases.length} cases (model: ${model})...`);
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    process.stdout.write(`  [${i + 1}/${cases.length}] ${c.id} ...`);
    const expandedPrompt = c.vars
      ? buildExpandedPrompt(c.vars)
      : defaultExpandedPrompt;
    const result = runCase(c, expandedPrompt);
    results.push(result);
    if (!dryRun) {
      const label = result.pass ? "PASS" : result.error ? "ERROR" : "FAIL";
      const sec = (result.duration_ms / 1000).toFixed(1);
      process.stdout.write(` ${label} (${sec}s)\n`);
    } else {
      process.stdout.write(" (dry run)\n");
    }
  }

  if (!dryRun) {
    const baseline = loadBaseline();
    const runData = buildRunData(cases, results);

    // Save run
    const runFile = saveRun(runData);
    console.log(`\nRun saved: ${runFile}`);

    // Report
    report(runData, baseline);

    // Promote
    if (save) {
      promoteBaseline(runData, baseline);
    } else if (!baseline) {
      console.log("  no baseline yet — run with --save to create one");
    } else if (runData.pass_rate > baseline.pass_rate) {
      console.log(`  \u2197 IMPROVED but not saved (run with --save)`);
    } else if (runData.pass_rate < baseline.pass_rate) {
      console.log(`  \u2B07 REGRESSED from baseline`);
    } else {
      console.log("  \u2194 STABLE — matches baseline");
    }
  }

  console.log("");
} finally {
  cleanupSandbox();
  console.log("Sandbox cleaned up.");
}

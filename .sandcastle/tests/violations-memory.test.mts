// Functional round-trip tests for recordViolation / loadViolationsMemory.
//
// Run: npx tsx --test .sandcastle/tests/violations-memory.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach } from "node:test";
import { rmSync, readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The module reads/writes ".sandcastle/violations.jsonl" relative to CWD,
// so we chdir to a temp directory for isolation.
const WORK = join(tmpdir(), `violations-mem-test-${process.pid}`);
let originalCwd: string;

function makeEntry(overrides: Record<string, string> = {}) {
  return {
    ts: "2026-10-22T12:00:00Z",
    issueId: "beads-001",
    ruleId: "ui-base/color-tokens",
    file: "src/components/Card.tsx",
    wrote: "color: #fff",
    fix: "color: var(--color-surface)",
    gate: "review",
    ...overrides,
  };
}

beforeEach(() => {
  originalCwd = process.cwd();
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  process.chdir(WORK);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(WORK, { recursive: true, force: true });
});

// Fresh import each test to avoid cached module state.
// The module is stateless (no mutable globals), so a single dynamic import
// per test is sufficient for isolation given we chdir to a fresh temp dir.
async function loadModule() {
  // tsx resolves .mts → .mjs for imports
  const mod = await import("../lib/violations-memory.mjs");
  return mod as {
    recordViolation: (entry: any) => void;
    loadViolationsMemory: (filterRuleIds?: string[]) => string;
  };
}

// ═══════════════════════════════════════════════════════════════════
// recordViolation
// ═══════════════════════════════════════════════════════════════════

describe("recordViolation", () => {
  test("(a) creates file and writes valid JSONL", async () => {
    const { recordViolation } = await loadModule();
    const entry = makeEntry();

    recordViolation(entry);

    const raw = readFileSync(".sandcastle/violations.jsonl", "utf8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 1);

    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.issueId, "beads-001");
    assert.equal(parsed.ruleId, "ui-base/color-tokens");
    assert.equal(parsed.file, "src/components/Card.tsx");
    assert.equal(parsed.gate, "review");
  });

  test("appends without overwriting previous entries", async () => {
    const { recordViolation } = await loadModule();

    recordViolation(makeEntry({ issueId: "beads-001" }));
    recordViolation(makeEntry({ issueId: "beads-002" }));

    const raw = readFileSync(".sandcastle/violations.jsonl", "utf8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).issueId, "beads-001");
    assert.equal(JSON.parse(lines[1]).issueId, "beads-002");
  });
});

// ═══════════════════════════════════════════════════════════════════
// loadViolationsMemory
// ═══════════════════════════════════════════════════════════════════

describe("loadViolationsMemory", () => {
  test("(d) missing file returns empty string", async () => {
    const { loadViolationsMemory } = await loadModule();

    const result = loadViolationsMemory();

    assert.equal(result, "");
  });

  test("(b) record 3 different rules, load groups by ruleId", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    recordViolation(makeEntry({ ruleId: "rule-A", file: "a.ts", wrote: "bad-a", fix: "good-a" }));
    recordViolation(makeEntry({ ruleId: "rule-B", file: "b.ts", wrote: "bad-b", fix: "good-b" }));
    recordViolation(makeEntry({ ruleId: "rule-C", file: "c.ts", wrote: "bad-c", fix: "good-c" }));

    const output = loadViolationsMemory();

    assert.ok(output.includes("[rule-A]"), "missing rule-A");
    assert.ok(output.includes("[rule-B]"), "missing rule-B");
    assert.ok(output.includes("[rule-C]"), "missing rule-C");
  });

  test("(c) duplicates with same direction collapse, count reflects total", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    // Same ruleId and direction — should collapse into one representative
    for (let i = 0; i < 5; i++) {
      recordViolation(makeEntry({ ruleId: "rule-X", wrote: "color: #fff", fix: "use token", direction: "raw-literal" }));
    }

    const output = loadViolationsMemory();

    // Should show count of 5 and only one line for rule-X
    assert.ok(output.includes("(5×)"), "should show 5× count");
    // Only one line for rule-X (the ruleId appears once in a single bullet)
    const ruleXLines = output.split("\n").filter(l => l.includes("[rule-X]"));
    assert.equal(ruleXLines.length, 1, "duplicate directions should collapse into one line");
  });

  test("(c2) different directions within same rule produce multiple examples", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    recordViolation(makeEntry({ ruleId: "rule-X", wrote: "color: #fff", fix: "use token", direction: "raw-literal" }));
    recordViolation(makeEntry({ ruleId: "rule-X", wrote: "bg: var(--fg)", fix: "use bgColor", direction: "wrong-tier" }));

    const output = loadViolationsMemory();

    assert.ok(output.includes("raw-literal"), "missing raw-literal direction");
    assert.ok(output.includes("wrong-tier"), "missing wrong-tier direction");
  });

  test("(c3) filterRuleIds limits output to specified rules", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    recordViolation(makeEntry({ ruleId: "rule-A", wrote: "bad-a", fix: "good-a" }));
    recordViolation(makeEntry({ ruleId: "rule-B", wrote: "bad-b", fix: "good-b" }));

    const filtered = loadViolationsMemory(["rule-A"]);

    assert.ok(filtered.includes("[rule-A]"), "filtered output missing rule-A");
    assert.ok(!filtered.includes("[rule-B]"), "filtered output should not contain rule-B");
  });

  test("(e) formatted output includes header", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    recordViolation(makeEntry());

    const output = loadViolationsMemory();

    assert.ok(output.startsWith("# Past violations"), "missing header");
    assert.ok(output.includes("do not repeat"), "missing 'do not repeat'");
  });

  test("(f) entries without direction use normalized wrote as fallback key", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    // Two entries with same normalized wrote but no explicit direction — should collapse
    recordViolation(makeEntry({ ruleId: "rule-X", wrote: "color: #fff", fix: "use token" }));
    recordViolation(makeEntry({ ruleId: "rule-X", wrote: "color: #fff", fix: "use token v2" }));

    const output = loadViolationsMemory();
    assert.ok(output.includes("(2×)"), "should show 2× count for collapsed entries");
  });
});

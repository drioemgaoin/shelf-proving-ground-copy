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
    loadViolationsMemory: () => string;
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

  test("(b) record 3, load returns all 3 with correct fields", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    recordViolation(makeEntry({ ruleId: "rule-A", file: "a.ts", wrote: "bad-a", fix: "good-a" }));
    recordViolation(makeEntry({ ruleId: "rule-B", file: "b.ts", wrote: "bad-b", fix: "good-b" }));
    recordViolation(makeEntry({ ruleId: "rule-C", file: "c.ts", wrote: "bad-c", fix: "good-c" }));

    const output = loadViolationsMemory();

    assert.ok(output.includes("[rule-A] in a.ts"), "missing rule-A entry");
    assert.ok(output.includes("[rule-B] in b.ts"), "missing rule-B entry");
    assert.ok(output.includes("[rule-C] in c.ts"), "missing rule-C entry");
    assert.ok(output.includes("bad-a"), "missing wrote field for A");
    assert.ok(output.includes("good-a"), "missing fix field for A");
  });

  test("(c) record 15, load returns only last 10", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    for (let i = 1; i <= 15; i++) {
      recordViolation(makeEntry({ ruleId: `rule-${String(i).padStart(2, "0")}` }));
    }

    const output = loadViolationsMemory();

    // Entries 1–5 should be truncated
    for (let i = 1; i <= 5; i++) {
      assert.ok(
        !output.includes(`[rule-${String(i).padStart(2, "0")}]`),
        `entry ${i} should be truncated`,
      );
    }
    // Entries 6–15 should be present
    for (let i = 6; i <= 15; i++) {
      assert.ok(
        output.includes(`[rule-${String(i).padStart(2, "0")}]`),
        `entry ${i} should be present`,
      );
    }
  });

  test("(e) formatted output includes header and learning instruction", async () => {
    const { recordViolation, loadViolationsMemory } = await loadModule();

    recordViolation(makeEntry());

    const output = loadViolationsMemory();

    assert.ok(output.startsWith("# Past violations"), "missing header");
    assert.ok(output.includes("learn from these"), "missing learning instruction");
    assert.ok(output.includes("do not repeat"), "missing 'do not repeat'");
    assert.ok(output.includes("Apply these lessons"), "missing application instruction");
  });
});

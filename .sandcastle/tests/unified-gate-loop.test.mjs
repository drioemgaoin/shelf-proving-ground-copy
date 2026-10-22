#!/usr/bin/env node
// Unit tests for the verified fixer loop — shrinking backlog, stuck detection,
// regression catching.
//
// These tests exercise the pure functions that underpin runVerifiedFixer:
// matchFailuresToFindings and the batching/counting logic. The orchestration
// (which calls agents) is tested via integration at the pipeline level.
//
// Run: node .sandcastle/tests/unified-gate-loop.test.mjs

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  matchFailuresToFindings,
  parseAllFindings,
  countFindings,
  formatFindings,
  parseVerificationFailures,
  chunkFindings,
} from "../lib/findings.mjs";

// ═════════════════════════════════════════════════════════════════════
// Scenario: Fixer fixes visual but breaks reviewer finding
// ═════════════════════════════════════════════════════════════════════

describe("verified fixer: fixer fixes one, breaks another", () => {
  test("new failure on different file added to backlog", () => {
    const originalFindings = [
      "FINDINGS",
      "- src/Card.css:12 `.card-border`",
      "  Cause: [visual] wrong border color",
      "  Current: border: 1px solid red",
      "  Fix: border: 1px solid var(--color-border-default)",
      "- src/Shelf.tsx:5 `ShelfGrid`",
      "  Cause: [review] missing key prop",
      "  Current: items.map(item => <Card />)",
      "  Fix: items.map(item => <Card key={item.id} />)",
    ].join("\n");

    // After fixer: Card.css is fixed, but Shelf.tsx still fails AND
    // App.tsx has a new failure (regression)
    const failures = [
      { file: "src/Shelf.tsx", line: 5, message: "missing key prop" },
      { file: "src/App.tsx", line: 10, message: "TS2322: Type error introduced by fixer" },
    ];

    const remaining = matchFailuresToFindings(failures, originalFindings);

    // Shelf.tsx finding should remain (still failing)
    const shelfFinding = remaining.find((f) => f.file === "src/Shelf.tsx");
    assert.ok(shelfFinding, "Shelf.tsx finding should remain in backlog");

    // Card.css should NOT remain (it was fixed)
    const cardFinding = remaining.find((f) => f.file === "src/Card.css");
    assert.equal(cardFinding, undefined, "Card.css should be removed (fixed)");

    // App.tsx regression should be added
    const appFinding = remaining.find((f) => f.file === "src/App.tsx");
    assert.ok(appFinding, "App.tsx regression should be added to backlog");
    assert.ok(appFinding.fix.includes("Fixer regression"), "Should be marked as regression");

    // Total: 2 remaining (Shelf.tsx original + App.tsx regression)
    assert.equal(remaining.length, 2, "Should have 2 remaining findings");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Scenario: 50 findings, fixer gets through 30, skips 20
// ═════════════════════════════════════════════════════════════════════

describe("verified fixer: partial fix progress", () => {
  test("50 findings, 30 fixed → 20 remain → backlog shrinks", () => {
    // Generate 50 findings
    const lines = ["FINDINGS"];
    for (let i = 1; i <= 50; i++) {
      lines.push(`- src/file${i}.tsx:${i} \`symbol${i}\``);
      lines.push(`  Cause: [rule-${i}] issue ${i}`);
      lines.push(`  Current: old code ${i}`);
      lines.push(`  Fix: new code ${i}`);
    }
    const originalFindings = lines.join("\n");

    assert.equal(countFindings(originalFindings), 50, "Should parse 50 findings");

    // After fixer: files 1-30 are fixed, 31-50 still failing
    const failures = [];
    for (let i = 31; i <= 50; i++) {
      failures.push({ file: `src/file${i}.tsx`, line: i, message: `still broken ${i}` });
    }

    const remaining = matchFailuresToFindings(failures, originalFindings);
    assert.equal(remaining.length, 20, "20 findings should remain");

    // Verify progress: 50 → 20 (shrunk, so not stuck)
    const previousCount = 50;
    const currentCount = remaining.length;
    assert.ok(currentCount < previousCount, "Backlog should shrink");

    // Format remaining for next pass
    const nextPassContent = formatFindings(remaining);
    assert.equal(countFindings(nextPassContent), 20, "Next pass should have 20 findings");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Scenario: Fixer stuck — same findings after pass
// ═════════════════════════════════════════════════════════════════════

describe("verified fixer: stuck detection", () => {
  test("same count after pass → stuck, should escalate", () => {
    const lines = ["FINDINGS"];
    for (let i = 1; i <= 5; i++) {
      lines.push(`- src/file${i}.tsx:${i} \`symbol${i}\``);
      lines.push(`  Cause: [rule-${i}] issue ${i}`);
      lines.push(`  Current: old ${i}`);
      lines.push(`  Fix: new ${i}`);
    }
    const originalFindings = lines.join("\n");

    // All 5 files still failing after fixer
    const failures = [];
    for (let i = 1; i <= 5; i++) {
      failures.push({ file: `src/file${i}.tsx`, line: i, message: `still broken ${i}` });
    }

    const remaining = matchFailuresToFindings(failures, originalFindings);
    assert.equal(remaining.length, 5, "All 5 findings should remain");

    // Progress check: 5 → 5, no progress
    const previousCount = 5;
    assert.ok(
      remaining.length >= previousCount,
      "No progress — should trigger escalation",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// Scenario: Fixer introduces regression not in original findings
// ═════════════════════════════════════════════════════════════════════

describe("verified fixer: regression detection", () => {
  test("new failure on unrelated file → added to backlog as regression", () => {
    const originalFindings = [
      "FINDINGS",
      "- src/Shelf.tsx:42 `ShelfGrid`",
      "  Cause: [review] complexity issue",
      "  Current: nested ternary",
      "  Fix: extract to helper function",
    ].join("\n");

    // Fixer fixed Shelf.tsx but broke App.tsx
    const failures = [
      { file: "src/App.tsx", line: 15, message: "TS2345: Argument of type 'string' is not assignable" },
    ];

    const remaining = matchFailuresToFindings(failures, originalFindings);

    // Shelf.tsx should be gone (no longer failing)
    assert.equal(
      remaining.filter((f) => f.file === "src/Shelf.tsx").length,
      0,
      "Fixed finding should be removed",
    );

    // App.tsx regression should be added
    assert.equal(remaining.length, 1, "Only the regression should remain");
    assert.equal(remaining[0].file, "src/App.tsx");
    assert.ok(remaining[0].source === "verification", "Source should be 'verification'");
    assert.ok(remaining[0].fix.includes("Fixer regression"), "Should be marked as regression");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Verification failure parsing
// ═════════════════════════════════════════════════════════════════════

describe("parseVerificationFailures", () => {
  test("parses TypeScript errors", () => {
    const output =
      "src/App.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.\n" +
      "src/Shelf.tsx:42:8 - error TS2345: Argument type mismatch.";

    const failures = parseVerificationFailures(output);
    assert.equal(failures.length, 2);
    assert.equal(failures[0].file, "src/App.tsx");
    assert.equal(failures[0].line, 10);
    assert.equal(failures[1].file, "src/Shelf.tsx");
    assert.equal(failures[1].line, 42);
  });

  test("parses vitest FAIL lines", () => {
    const output = "FAIL src/components/ChipBar/ChipBar.test.tsx > describe > test name";
    const failures = parseVerificationFailures(output);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].file, "src/components/ChipBar/ChipBar.test.tsx");
  });

  test("deduplicates same file:line", () => {
    const output =
      "src/App.tsx(10,5): error TS2322: first error\n" +
      "src/App.tsx(10,5): error TS2322: duplicate error";
    const failures = parseVerificationFailures(output);
    assert.equal(failures.length, 1, "Should deduplicate same file:line");
  });
});

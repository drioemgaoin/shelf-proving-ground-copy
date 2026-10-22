#!/usr/bin/env node
// Unit tests for mergeFindings — conflict detection and deduplication.
//
// Run: node .sandcastle/tests/merge-findings.test.mjs

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mergeFindings } from "../lib/findings.mjs";

// ═════════════════════════════════════════════════════════════════════
// Two checkers flag same line with different fixes → conflict
// ═════════════════════════════════════════════════════════════════════

describe("mergeFindings: conflict detection", () => {
  test("same line, different fixes → conflict detected", () => {
    /** @type {import('../lib/findings.mjs').CheckerResult[]} */
    const results = [
      {
        gateName: "Visual QA",
        clean: false,
        deferred: false,
        findings: [
          {
            file: "src/Card.css",
            line: 12,
            fix: "border-color: var(--color-border-default)",
            source: "visual-qa",
          },
        ],
        findingsContent:
          "FINDINGS\n- src/Card.css:12 `.card`\n  Cause: [visual] wrong border\n  Current: border-color: red\n  Fix: border-color: var(--color-border-default)",
      },
      {
        gateName: "Code review",
        clean: false,
        deferred: false,
        findings: [
          {
            file: "src/Card.css",
            line: 12,
            fix: "border-color: var(--color-border-subtle)",
            source: "review",
          },
        ],
        findingsContent:
          "FINDINGS\n- src/Card.css:12 `.card`\n  Cause: [review] inconsistent token\n  Current: border-color: red\n  Fix: border-color: var(--color-border-subtle)",
      },
    ];

    const { conflicts, mergedContent } = mergeFindings(results);

    assert.equal(conflicts.length, 1, "Should detect 1 conflict");
    assert.equal(conflicts[0].location, "src/Card.css:12");
    assert.equal(conflicts[0].findings.length, 2);
    // Merged content still written for audit
    assert.ok(mergedContent.includes("Visual QA"), "Merged content should contain Visual QA section");
    assert.ok(mergedContent.includes("Code review"), "Merged content should contain Code review section");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Two checkers flag same line with same fix → not a conflict
// ═════════════════════════════════════════════════════════════════════

describe("mergeFindings: deduplication", () => {
  test("same line, same fix → no conflict, deduplicated", () => {
    const results = [
      {
        gateName: "Visual QA",
        clean: false,
        deferred: false,
        findings: [
          {
            file: "src/Card.css",
            line: 12,
            fix: "border-color: var(--color-border-default)",
            source: "visual-qa",
          },
        ],
        findingsContent:
          "FINDINGS\n- src/Card.css:12 `.card`\n  Cause: [visual] wrong border\n  Current: border-color: red\n  Fix: border-color: var(--color-border-default)",
      },
      {
        gateName: "Code review",
        clean: false,
        deferred: false,
        findings: [
          {
            file: "src/Card.css",
            line: 12,
            fix: "border-color: var(--color-border-default)",
            source: "review",
          },
        ],
        findingsContent:
          "FINDINGS\n- src/Card.css:12 `.card`\n  Cause: [review] wrong border\n  Current: border-color: red\n  Fix: border-color: var(--color-border-default)",
      },
    ];

    const { conflicts, deduped } = mergeFindings(results);

    assert.equal(conflicts.length, 0, "No conflicts when fixes agree");
    assert.equal(deduped.length, 1, "Duplicate finding should be deduped to 1");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Visual clean, reviewer has findings
// ═════════════════════════════════════════════════════════════════════

describe("mergeFindings: partial clean", () => {
  test("visual clean, reviewer has findings → only reviewer section in output", () => {
    const results = [
      {
        gateName: "Visual QA",
        clean: true,
        deferred: false,
        findings: [],
        findingsContent: "PASS\nGate: 0 failures",
      },
      {
        gateName: "Code review",
        clean: false,
        deferred: false,
        findings: [
          { file: "src/App.tsx", line: 5, fix: "remove any cast", source: "review" },
          { file: "src/App.tsx", line: 10, fix: "rename variable", source: "review" },
          { file: "src/Shelf.tsx", line: 3, fix: "add explicit return type", source: "review" },
        ],
        findingsContent:
          "FINDINGS\n- src/App.tsx:5 ...\n- src/App.tsx:10 ...\n- src/Shelf.tsx:3 ...",
      },
    ];

    const { mergedContent, conflicts } = mergeFindings(results);

    assert.equal(conflicts.length, 0);
    assert.ok(!mergedContent.includes("Visual QA"), "Clean gate should not appear in merged content");
    assert.ok(mergedContent.includes("Code review"), "Reviewer section should be present");
  });
});

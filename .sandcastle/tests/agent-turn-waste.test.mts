// Eval tests for agent turn-waste issues identified in the djk.1 sandcastle run.
//
// Each test reproduces a specific issue that caused wasted turns/tokens inside
// an agent. The test fails if the corresponding fix is missing and passes once
// the fix is applied.
//
// Run: npx tsx --test .sandcastle/tests/agent-turn-waste.test.mts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readPrompt(name: string): string {
  return readFileSync(
    join(ROOT, ".sandcastle", "prompts", name),
    "utf8",
  );
}

function readViolationsFile(): string {
  return readFileSync(
    join(ROOT, ".sandcastle", "violations.jsonl"),
    "utf8",
  );
}

// ═══════════════════════════════════════════════════════════════════
// Issue 1: Stylelint formatting failures waste a full edit+lint cycle
// ═══════════════════════════════════════════════════════════════════

describe("Issue 1: stylelint auto-fix in pre-commit gate", () => {
  test("implementer gate runs stylelint --fix before lint", () => {
    const prompt = readPrompt("implementer.prompt.md");

    // The gate must include stylelint --fix BEFORE npm run lint.
    // Without this, every auto-fixable formatting issue (blank lines,
    // at-rule spacing) wastes a full edit+re-lint cycle.
    assert.match(
      prompt,
      /stylelint\s+--fix/,
      "implementer prompt must include 'stylelint --fix' in the pre-commit gate",
    );
  });

  test("violations memory covers no-descending-specificity pattern", () => {
    const violations = readViolationsFile();

    // no-descending-specificity is NOT auto-fixable by stylelint --fix.
    // The agent must learn about CSS selector specificity ordering from
    // past violations. Without this entry, the agent writes selectors in
    // wrong order, gets a lint error, then manually reorders.
    assert.match(
      violations,
      /no-descending-specificity|selector.*specificity.*order/i,
      "violations.jsonl must contain an entry teaching selector specificity ordering",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// Issue 2: Dark mode contrast — missing explicit button background
// ═══════════════════════════════════════════════════════════════════

describe("Issue 2: dark mode button contrast", () => {
  test("violations memory covers missing button background pattern", () => {
    const violations = readViolationsFile();

    // Custom-styled <button> elements without explicit background-color
    // inherit UA ButtonFace (light gray), which doesn't adapt to dark mode.
    // The agent wasted ~6 tool calls debugging this. Without this violation
    // entry, the agent will repeat the same mistake on every button component.
    assert.match(
      violations,
      /button.*background|background.*button|ButtonFace|appearance.*none/i,
      "violations.jsonl must contain an entry about explicit button backgrounds for dark mode",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// Issue 4: Code reviewer reads tokens.css 3 times in one review
// ═══════════════════════════════════════════════════════════════════

describe("Issue 4: reviewer file-read efficiency", () => {
  test("reviewer prompt includes file-read-once guidance", () => {
    const prompt = readPrompt("reviewer.prompt.md");

    // The reviewer agent read tokens.css three times in 3 seconds,
    // wasting 2 Read calls (~650 lines of context). The prompt must
    // instruct the agent to read each file at most once.
    assert.match(
      prompt,
      /read.*each.*file.*(?:once|at most once)|file.*at most once|do not re-read/i,
      "reviewer prompt must include guidance to read each file at most once",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// Issue 5: Test author act() warnings require fix+rerun
// ═══════════════════════════════════════════════════════════════════

describe("Issue 5: test author act() guidance", () => {
  test("test-author prompt includes act() guidance for hook tests", () => {
    const prompt = readPrompt("test-author.prompt.md");

    // The test author wrote a useBooks hook test that triggered act()
    // warnings on first run, requiring an edit+rerun cycle. The prompt
    // must teach the act() pattern upfront so agents get it right on
    // the first pass.
    assert.match(
      prompt,
      /act\(\)/,
      "test-author prompt must include guidance about act() for async hook tests",
    );
  });
});

#!/usr/bin/env node
/**
 * T3 injection integration tests — prove that apply-t3 payloads reach
 * the Visual QA and Reviewer agent prompts during the gate loop.
 *
 * Three integration points must all be present:
 *   1. Prompt templates contain {{T3_VISUAL_CHECKS}} / {{T3_REVIEW_CHECKS}}
 *   2. Gate runner calls expandAndSave with ticketId so Stage 3 resolves payloads
 *   3. runQAGates invokes apply-t3.mjs before entering the gate loop
 *
 * These tests are RED until all three are wired.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

let passed = 0;
let failed = 0;
const failures = [];

async function test(label, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`FAIL: ${label} — ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// 1. Prompt templates must contain T3 placeholders
// ---------------------------------------------------------------------------

await test("visual-qa.prompt.md contains {{T3_VISUAL_CHECKS}} placeholder", () => {
  const path = join(ROOT, ".sandcastle/prompts/visual-qa.prompt.md");
  assert(existsSync(path), `Template missing: ${path}`);
  const content = readFileSync(path, "utf8");
  assert(
    /\{\{\s*T3_VISUAL_CHECKS\s*\}\}/.test(content),
    "visual-qa.prompt.md must contain {{T3_VISUAL_CHECKS}} placeholder for T3 rule injection",
  );
});

await test("reviewer.prompt.md contains {{T3_REVIEW_CHECKS}} placeholder", () => {
  const path = join(ROOT, ".sandcastle/prompts/reviewer.prompt.md");
  assert(existsSync(path), `Template missing: ${path}`);
  const content = readFileSync(path, "utf8");
  assert(
    /\{\{\s*T3_REVIEW_CHECKS\s*\}\}/.test(content),
    "reviewer.prompt.md must contain {{T3_REVIEW_CHECKS}} placeholder for T3 rule injection",
  );
});

// ---------------------------------------------------------------------------
// 2. Gate runner passes ticketId to expandAndSave (Stage 3 activation)
// ---------------------------------------------------------------------------

await test("qa-gates.mts passes ticketId option to expandAndSave for checker prompts", () => {
  const path = join(ROOT, ".sandcastle/lib/qa-gates.mts");
  assert(existsSync(path), `Source missing: ${path}`);
  const content = readFileSync(path, "utf8");

  // The expandAndSave call for the checker must include a ticketId option.
  // We find lines containing both checkerPromptFile and ticketId.
  const lines = content.split("\n");
  const checkerExpandLine = lines.find(
    (l) => l.includes("expandAndSave") && l.includes("checkerPromptFile"),
  );
  assert(
    checkerExpandLine,
    "Expected expandAndSave call referencing checkerPromptFile",
  );
  assert(
    checkerExpandLine.includes("ticketId"),
    "expandAndSave for checker prompt must pass { ticketId } option so Stage 3 injects T3 payloads",
  );
});

// ---------------------------------------------------------------------------
// 3. runQAGates calls apply-t3.mjs before the gate loop
// ---------------------------------------------------------------------------

await test("phases.mts runQAGates invokes apply-t3.mjs before gate loop", () => {
  const path = join(ROOT, ".sandcastle/lib/phases.mts");
  assert(existsSync(path), `Source missing: ${path}`);
  const content = readFileSync(path, "utf8");

  // The function runQAGates must call apply-t3.mjs (or a wrapper) before
  // entering the gate loop. We check for the script invocation.
  assert(
    content.includes("apply-t3") || content.includes("applyT3"),
    "runQAGates must invoke apply-t3.mjs to generate T3 payloads before gates run",
  );
});

// ---------------------------------------------------------------------------
// 4. Prompts must NOT hardcode rule file references (T3 is the single source)
// ---------------------------------------------------------------------------

await test("visual-qa.prompt.md does not tell agent to read rules files", () => {
  const path = join(ROOT, ".sandcastle/prompts/visual-qa.prompt.md");
  const content = readFileSync(path, "utf8");
  // Should not contain instructions to read/apply specific rules files
  const hardcoded = [
    /Read and apply.*ui-base/i,
    /Read and apply.*ui-project/i,
    /See.*coding-standards/i,
    /Your rule scope.*ui-base\.md/,
  ];
  for (const re of hardcoded) {
    assert(
      !re.test(content),
      `visual-qa.prompt.md still contains hardcoded rule reference: ${re}`,
    );
  }
});

await test("reviewer.prompt.md does not tell agent to read rules files", () => {
  const path = join(ROOT, ".sandcastle/prompts/reviewer.prompt.md");
  const content = readFileSync(path, "utf8");
  const hardcoded = [
    /See.*\.claude\/rules\/coding-standards\.md/,
    /Read and apply.*ui-base/i,
    /Read and apply.*ui-project/i,
  ];
  for (const re of hardcoded) {
    assert(
      !re.test(content),
      `reviewer.prompt.md still contains hardcoded rule reference: ${re}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. T3 payload includes provenance metadata for proper citations
// ---------------------------------------------------------------------------

await test("parseEnforcementBlocks captures sectionHeading", async () => {
  // Import the parser and test with a known rules snippet
  const { parseEnforcementBlocks } = await import("../../../.claude/hooks/lib/rules.mjs");
  const markdown = `## My Section

- Some rule text here.

  \`\`\`enforcement
  id: "test-rule"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: test
  instruction: "Check something"
  \`\`\`
`;
  const { blocks } = parseEnforcementBlocks(markdown, "/fake/rules.md");
  assert(blocks.length === 1, `Expected 1 block, got ${blocks.length}`);
  assert(
    blocks[0].sectionHeading === "My Section",
    `Expected sectionHeading "My Section", got "${blocks[0].sectionHeading}"`,
  );
  assert(
    blocks[0].ruleText === "Some rule text here.",
    `Expected ruleText "Some rule text here.", got "${blocks[0].ruleText}"`,
  );
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("");
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log("");
}
console.log(
  `t3-injection tests: ${passed} passed, ${failed} failed, ${passed + failed} total`,
);
process.exit(failed > 0 ? 1 : 0);

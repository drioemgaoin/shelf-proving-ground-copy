#!/usr/bin/env node
// Unit tests for findingsOverlap applied to unified (cross-checker) content.
//
// Run: node .sandcastle/tests/cross-checker-oscillation.test.mjs

import assert from "node:assert/strict";
import { describe, test } from "node:test";

// findingsOverlap is in qa-gates.mts (TypeScript). Since we can't import
// .mts directly, we replicate the function here for testing. The real
// implementation is tested by importing it in the orchestration code.
// This test verifies the algorithm on unified (multi-section) content.

// Replicated from qa-gates.mts — kept in sync by the cross-checker-oscillation
// integration test in the pipeline.
function findingsOverlap(prev, curr) {
  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const similarity = (a, b) => {
    const setA = new Set(a.split(" ").filter((w) => w.length > 2));
    const setB = new Set(b.split(" ").filter((w) => w.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;
    let overlap = 0;
    for (const w of setA) if (setB.has(w)) overlap++;
    return overlap / Math.min(setA.size, setB.size);
  };
  const extract = (text) => {
    const findings = [];
    for (const m of text.matchAll(
      /^- `?(src\/[^\s:]+)[:\s\d-]*\s*[—–-]\s*(.+)/gm,
    )) {
      findings.push({ file: m[1], desc: normalize(m[2]) });
    }
    return findings;
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
  return currFindings.length > 0 && matches / currFindings.length > 0.5;
}

// ═════════════════════════════════════════════════════════════════════
// Round 1 and round 2 unified findings overlap >50%
// ═════════════════════════════════════════════════════════════════════

describe("cross-checker oscillation: overlapping rounds", () => {
  test("same locations with similar descriptions → oscillation detected", () => {
    // Use the format the actual pipeline produces (no backtick wrap around file:line)
    const round1 = [
      "## Visual QA",
      "",
      "FINDINGS",
      "- src/Card.css:12 — border color should use design token instead of hardcoded value",
      "",
      "## Code review",
      "",
      "FINDINGS",
      "- src/Shelf.css:5 — margin value should reference spacing token not pixel literal",
    ].join("\n");

    const round2 = [
      "## Visual QA",
      "",
      "FINDINGS",
      "- src/Card.css:12 — border color must use the design token variable not a hardcoded color",
      "",
      "## Code review",
      "",
      "FINDINGS",
      "- src/Shelf.css:5 — margin should use spacing design token instead of a pixel value",
    ].join("\n");

    assert.equal(
      findingsOverlap(round1, round2),
      true,
      "Should detect oscillation when findings re-target same locations with similar descriptions",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// Round 2 has completely different findings
// ═════════════════════════════════════════════════════════════════════

describe("cross-checker oscillation: new findings", () => {
  test("completely different locations → not oscillation", () => {
    const round1 = [
      "## Visual QA",
      "",
      "FINDINGS",
      "- src/Card.css:12 — border color should use design token",
    ].join("\n");

    const round2 = [
      "## Code review",
      "",
      "FINDINGS",
      "- src/App.tsx:42 — unused import should be removed from the module header",
    ].join("\n");

    assert.equal(
      findingsOverlap(round1, round2),
      false,
      "Different locations should not be detected as oscillation",
    );
  });
});

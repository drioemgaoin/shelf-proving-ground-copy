#!/usr/bin/env node
// Unit tests for chunkFindings — batching large finding sets.
//
// Run: node .sandcastle/tests/fixer-batching.test.mjs

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chunkFindings, parseAllFindings } from "../lib/findings.mjs";

/** Generate a findings file with `n` structured entries. */
function generateFindings(n) {
  const lines = ["FINDINGS"];
  for (let i = 1; i <= n; i++) {
    lines.push(`- src/file${i}.tsx:${i} \`selector${i}\``);
    lines.push(`  Cause: [rule-${i}] description ${i}`);
    lines.push(`  Current: old code ${i}`);
    lines.push(`  Fix: new code ${i}`);
  }
  return lines.join("\n");
}

// ═════════════════════════════════════════════════════════════════════
// 100 findings split into batches of 30
// ═════════════════════════════════════════════════════════════════════

describe("chunkFindings: 100 findings", () => {
  test("splits into 4 batches: 30, 30, 30, 10", () => {
    const content = generateFindings(100);
    const batches = chunkFindings(content, 30);

    assert.equal(batches.length, 4, "Should produce 4 batches");

    const counts = batches.map((b) => parseAllFindings(b).length);
    assert.deepEqual(counts, [30, 30, 30, 10], "Batch sizes should be 30, 30, 30, 10");

    // Each batch should be a valid findings file (starts with FINDINGS)
    for (const batch of batches) {
      assert.ok(batch.startsWith("FINDINGS"), "Each batch should be a valid findings file");
      assert.ok(parseAllFindings(batch).length > 0, "Each batch should be parseable");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// 15 findings — no batching
// ═════════════════════════════════════════════════════════════════════

describe("chunkFindings: under threshold", () => {
  test("15 findings → single batch, identical to input", () => {
    const content = generateFindings(15);
    const batches = chunkFindings(content, 30);

    assert.equal(batches.length, 1, "Should produce 1 batch");
    assert.equal(batches[0], content, "Single batch should be identical to input");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Edge cases
// ═════════════════════════════════════════════════════════════════════

describe("chunkFindings: edge cases", () => {
  test("exactly BATCH_SIZE findings → single batch", () => {
    const content = generateFindings(30);
    const batches = chunkFindings(content, 30);
    assert.equal(batches.length, 1);
  });

  test("BATCH_SIZE + 1 findings → 2 batches", () => {
    const content = generateFindings(31);
    const batches = chunkFindings(content, 30);
    assert.equal(batches.length, 2);
    const counts = batches.map((b) => parseAllFindings(b).length);
    assert.deepEqual(counts, [30, 1]);
  });
});

// Pure functions for parsing, merging, chunking, and matching QA findings.
//
// These are plain JS (not TS) so tests can import without tsx.
// The orchestration code in qa-gates.mts imports from here.

/**
 * @typedef {{ file: string, line: number, fix: string, source: string, desc?: string }} ParsedFinding
 * @typedef {{ file: string, line: number, message: string }} VerificationFailure
 * @typedef {{ gateName: string, clean: boolean, deferred: boolean, findings: ParsedFinding[], findingsContent: string }} CheckerResult
 */

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse findings from a findings file content.
 * Expected format:
 *   FINDINGS
 *   - src/file.ext:42 `selector`
 *     Cause: [rule] description
 *     Current: problematic code
 *     Fix: exact replacement
 *
 * @param {string} content
 * @returns {ParsedFinding[]}
 */
export function parseAllFindings(content) {
  const findings = [];
  // Match the structured findings format from reviewer and visual-qa
  const entryRe =
    /^- (\S+?):(\d+)\s+[^\n]*\n\s+Cause:\s+([^\n]*)\n\s+Current:\s+([^\n]*)\n\s+Fix:\s+([^\n]*)/gm;
  let m;
  while ((m = entryRe.exec(content)) !== null) {
    const [, file, lineStr, cause, , fix] = m;
    findings.push({
      file,
      line: parseInt(lineStr, 10),
      fix: fix.trim(),
      source: cause.trim(),
      desc: cause.trim(),
    });
  }

  // Fallback: also parse simpler "- file:line description" lines if no structured matches
  if (findings.length === 0) {
    const simpleRe = /^- (\S+?):(\d+)\s+(.*)/gm;
    while ((m = simpleRe.exec(content)) !== null) {
      const [, file, lineStr, desc] = m;
      findings.push({
        file,
        line: parseInt(lineStr, 10),
        fix: desc.trim(),
        source: "unknown",
        desc: desc.trim(),
      });
    }
  }
  return findings;
}

/** Count findings in a findings file content. */
export function countFindings(content) {
  return parseAllFindings(content).length;
}

/**
 * Format parsed findings back into a findings file string.
 * @param {ParsedFinding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {
  if (findings.length === 0) return "CLEAN\nNo issues found.";
  const lines = ["FINDINGS"];
  for (const f of findings) {
    lines.push(`- ${f.file}:${f.line} \`${f.source}\``);
    lines.push(`  Cause: [${f.source}] ${f.desc ?? f.fix}`);
    lines.push(`  Current: (see source)`);
    lines.push(`  Fix: ${f.fix}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Chunking (batching)
// ---------------------------------------------------------------------------

/**
 * Split findings content into batches of at most `batchSize` findings.
 * Each batch is a valid findings file string.
 *
 * @param {string} content - The full findings file content
 * @param {number} batchSize - Max findings per batch
 * @returns {string[]} Array of batch contents
 */
export function chunkFindings(content, batchSize) {
  const all = parseAllFindings(content);
  if (all.length <= batchSize) return [content];

  const batches = [];
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    batches.push(formatFindings(batch));
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Merging with conflict detection
// ---------------------------------------------------------------------------

/**
 * Merge findings from multiple checker results.
 * Detects conflicts: same file+line, different fixes.
 *
 * @param {CheckerResult[]} results
 * @returns {{ mergedContent: string, conflicts: { location: string, findings: ParsedFinding[] }[], deduped: ParsedFinding[] }}
 */
export function mergeFindings(results) {
  const allFindings = results.flatMap((r) => r.findings);
  const byLocation = new Map();

  for (const f of allFindings) {
    const key = `${f.file}:${f.line}`;
    const arr = byLocation.get(key) ?? [];
    arr.push(f);
    byLocation.set(key, arr);
  }

  const conflicts = [];
  for (const [loc, findings] of byLocation) {
    if (findings.length > 1) {
      const fixes = new Set(findings.map((f) => f.fix.trim()));
      if (fixes.size > 1) conflicts.push({ location: loc, findings });
    }
  }

  // Deduplicate: same file+line+fix → keep first
  const seen = new Set();
  const deduped = [];
  for (const f of allFindings) {
    const key = `${f.file}:${f.line}:${f.fix.trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(f);
    }
  }

  const mergedContent = results
    .filter((r) => !r.clean)
    .map((r) => `## ${r.gateName}\n\n${r.findingsContent}`)
    .join("\n\n---\n\n");

  return { mergedContent, conflicts, deduped };
}

// ---------------------------------------------------------------------------
// Verification failure parsing
// ---------------------------------------------------------------------------

/**
 * Parse verification command output into structured failures.
 * Handles TypeScript errors, ESLint errors, and test failures.
 *
 * @param {string} output - Combined stdout+stderr from verification
 * @returns {VerificationFailure[]}
 */
export function parseVerificationFailures(output) {
  const failures = [];
  const seen = new Set();

  // TypeScript: src/file.tsx(10,5): error TS2322: ...
  // or: src/file.tsx:10:5 - error TS2322: ...
  const tsRe = /(\S+?)[:(](\d+)[,:](\d+)\)?[:\s-]*error\s+(TS\d+:\s*.*)/g;
  let m;
  while ((m = tsRe.exec(output)) !== null) {
    const key = `${m[1]}:${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      failures.push({ file: m[1], line: parseInt(m[2], 10), message: m[4].trim() });
    }
  }

  // ESLint: /path/to/file.tsx:10:5  error  description  rule-name
  const eslintRe = /^\s*(\S+?):(\d+):\d+\s+error\s+(.+)/gm;
  while ((m = eslintRe.exec(output)) !== null) {
    const file = m[1].replace(/^.*?(?=src\/)/, ""); // normalize to relative
    const key = `${file}:${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      failures.push({ file, line: parseInt(m[2], 10), message: m[3].trim() });
    }
  }

  // Vitest: FAIL src/file.test.tsx > describe > test name
  const vitestRe = /FAIL\s+(\S+)/g;
  while ((m = vitestRe.exec(output)) !== null) {
    const key = `${m[1]}:0`;
    if (!seen.has(key)) {
      seen.add(key);
      failures.push({ file: m[1], line: 0, message: `Test failure in ${m[1]}` });
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Matching failures to findings
// ---------------------------------------------------------------------------

/**
 * Map verification failures back to original findings.
 * A failure matches a finding if they share the same file.
 * Unmatched failures are new regressions introduced by the fixer.
 *
 * @param {VerificationFailure[]} failures
 * @param {string} originalFindings - The findings file content
 * @returns {ParsedFinding[]}
 */
export function matchFailuresToFindings(failures, originalFindings) {
  const remaining = [];
  const allFindings = parseAllFindings(originalFindings);

  for (const finding of allFindings) {
    const stillFailing = failures.some((f) => f.file === finding.file);
    if (stillFailing) remaining.push(finding);
  }

  // New regressions (failures not in original findings) → add as new findings
  const knownFiles = new Set(allFindings.map((f) => f.file));
  for (const f of failures) {
    if (!knownFiles.has(f.file)) {
      remaining.push({
        file: f.file,
        line: f.line,
        fix: `Fixer regression: ${f.message}`,
        source: "verification",
        desc: `Fixer regression: ${f.message}`,
      });
    }
  }

  return remaining;
}

// Reset must only revert src/ files the ticket branch changed — not the
// entire src/ tree. Blanket restore clobbers independent changes (e.g.
// tokens.css updated outside the ticket).
//
// Strategy: build a real git repo with a known history, run the reset
// revert logic, and assert that only ticket-touched files were reverted.
//
// Run: npx tsx --test .sandcastle/tests/reset-surgical-revert.test.mts

import assert from "node:assert/strict";
import { describe, test, afterEach } from "node:test";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

function git(repo: string, cmd: string): string {
  return execSync(`git ${cmd}`, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@test.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@test.com",
    },
  }).trim();
}

function writeFile(repo: string, relPath: string, content: string): void {
  const full = join(repo, relPath);
  const dir = dirname(full);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(full, content);
}

// ---------------------------------------------------------------------------
// Build a repo that mirrors the real scenario:
//
// main:  A ─── B ─── M ─── C
//               \   /
//  branch:       D
//
// A: initial src/styles/tokens.css (foundation) + src/api.ts
// B: update tokens.css (independent change, NOT part of ticket)
// D: branch adds src/components/Shelf.tsx + modifies src/api.ts
// M: merge branch into main
// C: post-merge WIP commit updating tokens.css again
//
// Reset should revert src/components/Shelf.tsx and src/api.ts (ticket files)
// but NOT src/styles/tokens.css (independent change).
// ---------------------------------------------------------------------------

function buildTestRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "reset-test-"));
  git(repo, "init -b main");
  git(repo, "config commit.gpgsign false");

  // A: initial state
  writeFile(repo, "src/styles/tokens.css", "@layer tokens { --color: red; }\n");
  writeFile(repo, "src/api.ts", "export function getBooks() { return []; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'A: initial'");

  // B: independent tokens.css update (NOT part of ticket)
  writeFile(repo, "src/styles/tokens.css", "@layer tokens, base, components;\n@layer tokens { --color: red; }\n@layer base { box-sizing: border-box; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'B: add layer order and base layer'");

  // Branch off for the ticket
  git(repo, "checkout -b sandcastle/issue-test-ticket-1");

  // D: ticket changes — modify api.ts and add a new component
  writeFile(repo, "src/api.ts", "export function getBooks() { return ['book']; }\nexport function addBook() {}\n");
  writeFile(repo, "src/components/Shelf.tsx", "export function Shelf() { return <div/>; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'D: ticket implementation'");

  // Back to main for merge
  git(repo, "checkout main");
  git(repo, "merge --no-ff sandcastle/issue-test-ticket-1 -m 'Merge pull request #1 from user/sandcastle/issue-test-ticket-1'");

  // C: post-merge WIP commit updating tokens.css again
  writeFile(repo, "src/styles/tokens.css", "@layer tokens, base, components;\n@layer tokens { --color: blue; }\n@layer base { box-sizing: border-box; }\n@custom-media --viewport-md (width >= 768px);\n");
  git(repo, "add -A");
  git(repo, "commit -m 'C: WIP improvements to tokens'");

  return repo;
}

const repos: string[] = [];
afterEach(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
  repos.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers to extract the revert logic from reset.mts
// ---------------------------------------------------------------------------

/** Compute files the ticket branch changed (the merge diff). */
function ticketChangedFiles(repo: string, mergeCommit: string): string[] {
  // Diff between the merge's first parent (main before merge) and second
  // parent (branch tip) — exactly the files the ticket introduced.
  const output = git(repo, `diff --name-only ${mergeCommit}^1 ${mergeCommit}^2 -- src/`);
  return output ? output.split("\n").filter(Boolean) : [];
}

/** Surgical revert: only restore ticket-changed files from baseline. */
function surgicalRevert(repo: string, baseline: string, changedFiles: string[]): void {
  for (const file of changedFiles) {
    const existsAtBaseline = git(repo, `ls-tree ${baseline} -- "${file}"`);
    if (existsAtBaseline) {
      git(repo, `checkout ${baseline} -- "${file}"`);
    } else {
      try { git(repo, `rm -f --cached "${file}"`); } catch {}
      try { execSync(`rm -f "${join(repo, file)}"`, { cwd: repo }); } catch {}
    }
  }

  const staged = git(repo, "diff --cached --name-only");
  if (staged) {
    git(repo, `commit -m "Revert ticket files only"`);
  }
  try { git(repo, "clean -fd src/"); } catch {}
}

/** Blanket revert (current broken behavior): restores ALL of src/. */
function blanketRevert(repo: string, baseline: string): void {
  try { git(repo, "rm -r --cached --quiet src/"); } catch {}
  git(repo, `checkout ${baseline} -- src/`);
  try { git(repo, "clean -fd src/"); } catch {}

  const staged = git(repo, "diff --cached --name-only");
  if (staged) {
    git(repo, `commit -m "Revert all src/"`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reset: surgical vs blanket src/ revert", () => {

  test("blanket revert clobbers independent tokens.css changes (reproduces the bug)", () => {
    const repo = buildTestRepo();
    repos.push(repo);

    // Find the merge commit
    const mergeHash = git(repo, 'log --first-parent --merges --grep="sandcastle/issue-test-ticket-1" --format=%H main');
    assert.ok(mergeHash, "Should find the merge commit");

    const baseline = git(repo, `rev-parse ${mergeHash}^1`);

    // Read tokens.css before revert — should have post-merge WIP content
    const tokensBefore = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(tokensBefore.includes("@custom-media"), "tokens.css should have post-merge WIP changes");
    assert.ok(tokensBefore.includes("--color: blue"), "tokens.css should have WIP color value");

    // Run blanket revert (current broken behavior)
    blanketRevert(repo, baseline);

    // tokens.css was clobbered back to baseline (commit B) — losing post-merge WIP changes.
    // The baseline has the layer order (B added it) but NOT @custom-media or --color: blue
    // (those came from post-merge commit C). This is the bug: independent post-merge
    // improvements to tokens.css are wiped out.
    const tokensAfter = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(
      !tokensAfter.includes("@custom-media"),
      "Blanket revert should have clobbered the post-merge @custom-media (proving the bug exists)",
    );
    assert.ok(
      !tokensAfter.includes("--color: blue"),
      "Blanket revert should have lost the post-merge color change (proving the bug exists)",
    );
  });

  test("surgical revert preserves independent tokens.css changes", () => {
    const repo = buildTestRepo();
    repos.push(repo);

    // Find the merge commit
    const mergeHash = git(repo, 'log --first-parent --merges --grep="sandcastle/issue-test-ticket-1" --format=%H main');
    assert.ok(mergeHash, "Should find the merge commit");

    const baseline = git(repo, `rev-parse ${mergeHash}^1`);
    const changed = ticketChangedFiles(repo, mergeHash);

    // Ticket should have changed api.ts and components/Shelf.tsx — NOT tokens.css
    assert.ok(changed.includes("src/api.ts"), "Ticket changed api.ts");
    assert.ok(changed.includes("src/components/Shelf.tsx"), "Ticket added Shelf.tsx");
    assert.ok(!changed.includes("src/styles/tokens.css"), "Ticket did NOT change tokens.css");

    // Read tokens.css before revert
    const tokensBefore = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(tokensBefore.includes("@custom-media"), "tokens.css should have post-merge WIP changes");

    // Run surgical revert
    surgicalRevert(repo, baseline, changed);

    // tokens.css should be PRESERVED
    const tokensAfter = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(
      tokensAfter.includes("@custom-media"),
      "Surgical revert must preserve independent tokens.css changes",
    );
    assert.ok(
      tokensAfter.includes("@layer tokens, base, components"),
      "Surgical revert must preserve layer order",
    );

    // Ticket files should be reverted to baseline
    const apiAfter = readFileSync(join(repo, "src/api.ts"), "utf8");
    assert.equal(
      apiAfter,
      "export function getBooks() { return []; }\n",
      "api.ts should be reverted to baseline (pre-ticket state)",
    );

    // New file added by ticket should be removed
    const shelfExists = execSync(`test -f "${join(repo, "src/components/Shelf.tsx")}" && echo yes || echo no`, {
      encoding: "utf8",
    }).trim();
    assert.equal(shelfExists, "no", "Shelf.tsx (added by ticket) should be removed");
  });

  test("surgical revert handles ticket that also modified tokens.css", () => {
    const repo = buildTestRepo();
    repos.push(repo);

    // Simulate: ticket ALSO modified tokens.css on its branch
    git(repo, "checkout sandcastle/issue-test-ticket-1");
    writeFile(repo, "src/styles/tokens.css", "@layer tokens { --color: red; }\n/* ticket added this */\n");
    git(repo, "add -A");
    git(repo, "commit -m 'D2: ticket also touches tokens.css'");

    // Back to main, re-merge
    git(repo, "checkout main");
    // Reset to before the old merge
    const mergeHash = git(repo, 'log --first-parent --merges --grep="sandcastle/issue-test-ticket-1" --format=%H main');
    git(repo, `reset --hard ${mergeHash}^1`);
    git(repo, "merge --no-ff sandcastle/issue-test-ticket-1 -m 'Merge pull request #2 from user/sandcastle/issue-test-ticket-1'");

    // Post-merge WIP
    writeFile(repo, "src/styles/tokens.css", "@layer tokens, base;\n@layer tokens { --color: blue; }\n");
    git(repo, "add -A");
    git(repo, "commit -m 'C2: WIP improvements'");

    // Now reset
    const mergeHash2 = git(repo, 'log --first-parent --merges --grep="sandcastle/issue-test-ticket-1" --format=%H main');
    const baseline = git(repo, `rev-parse ${mergeHash2}^1`);
    const changed = ticketChangedFiles(repo, mergeHash2);

    assert.ok(changed.includes("src/styles/tokens.css"), "Ticket DID change tokens.css this time");

    surgicalRevert(repo, baseline, changed);

    // tokens.css should be reverted to baseline (commit B) since the ticket touched it
    const tokensAfter = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.equal(
      tokensAfter,
      "@layer tokens, base, components;\n@layer tokens { --color: red; }\n@layer base { box-sizing: border-box; }\n",
      "tokens.css should be reverted to baseline when ticket modified it",
    );
  });
});

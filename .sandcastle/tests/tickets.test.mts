// Unit tests for readTicketFiles / ticketsToReadyJson — --tickets mode parsing.
//
// Run: npx tsx --test .sandcastle/tests/tickets.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readTicketFiles, ticketsToReadyJson } from "../lib/tickets.mjs";
import type { TicketFile } from "../lib/tickets.mjs";

// ── Temp directory per test ─────────────────────────────────────────

const WORK = join(tmpdir(), `tickets-test-${process.pid}`);

function cleanup() {
  rmSync(WORK, { recursive: true, force: true });
}

beforeEach(() => {
  cleanup();
  mkdirSync(WORK, { recursive: true });
});

afterEach(() => cleanup());

// ═══════════════════════════════════════════════════════════════════
// readTicketFiles
// ═══════════════════════════════════════════════════════════════════

describe("readTicketFiles", () => {
  test("parses a standard ticket with id, title, and blocked-by", () => {
    writeFileSync(
      join(WORK, "01-shelf-grid.md"),
      [
        "# 01: Shelf grid page load",
        "",
        "Build the shelf grid.",
        "",
        "**Blocked by:** 00",
      ].join("\n"),
    );

    const tickets = readTicketFiles(WORK);

    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].id, "01");
    assert.equal(tickets[0].title, "Shelf grid page load");
    assert.deepEqual(tickets[0].blockedBy, ["00"]);
    assert.equal(tickets[0].filename, "01-shelf-grid.md");
  });

  test("blocked-by 'none' produces empty blockedBy array", () => {
    writeFileSync(
      join(WORK, "02-card.md"),
      ["# 02: Book card", "", "**Blocked by:** none"].join("\n"),
    );

    const tickets = readTicketFiles(WORK);

    assert.equal(tickets.length, 1);
    assert.deepEqual(tickets[0].blockedBy, []);
  });

  test("multiple blocked-by IDs are all captured", () => {
    writeFileSync(
      join(WORK, "03-drawer.md"),
      ["# 03: Drawer", "", "**Blocked by:** 01, 02"].join("\n"),
    );

    const tickets = readTicketFiles(WORK);

    assert.deepEqual(tickets[0].blockedBy, ["01", "02"]);
  });

  test("missing title line falls back to filename", () => {
    writeFileSync(join(WORK, "04-fab.md"), "Just some body text.\n");

    const tickets = readTicketFiles(WORK);

    assert.equal(tickets[0].title, "04-fab.md");
  });

  test("missing blocked-by line produces empty array", () => {
    writeFileSync(join(WORK, "05-empty.md"), "# 05: Empty state\n");

    const tickets = readTicketFiles(WORK);

    assert.deepEqual(tickets[0].blockedBy, []);
  });

  test("empty directory returns empty array", () => {
    // No files written — WORK is empty
    const tickets = readTicketFiles(WORK);

    assert.equal(tickets.length, 0);
    assert.deepEqual(tickets, []);
  });

  test("ignores non-.md files and sorts by filename", () => {
    writeFileSync(join(WORK, "02-second.md"), "# 02: Second\n");
    writeFileSync(join(WORK, "01-first.md"), "# 01: First\n");
    writeFileSync(join(WORK, "notes.txt"), "not a ticket");

    const tickets = readTicketFiles(WORK);

    assert.equal(tickets.length, 2);
    assert.equal(tickets[0].id, "01");
    assert.equal(tickets[1].id, "02");
  });

  test("filename without numeric prefix uses full stem as id", () => {
    writeFileSync(join(WORK, "setup.md"), "# Setup\nSome instructions.\n");

    const tickets = readTicketFiles(WORK);

    assert.equal(tickets[0].id, "setup");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ticketsToReadyJson
// ═══════════════════════════════════════════════════════════════════

describe("ticketsToReadyJson", () => {
  test("produces correct JSON structure with ticket- prefixed ids", () => {
    const tickets: TicketFile[] = [
      {
        id: "01",
        title: "Shelf grid",
        content: "# 01: Shelf grid\nBuild it.",
        blockedBy: [],
        filename: "01-shelf-grid.md",
      },
    ];

    const json = JSON.parse(ticketsToReadyJson(tickets));

    assert.equal(json.length, 1);
    assert.equal(json[0].id, "ticket-01");
    assert.equal(json[0].title, "Shelf grid");
    assert.equal(json[0].description, "# 01: Shelf grid\nBuild it.");
    assert.equal(json[0].status, "open");
    assert.equal(json[0].priority, 2);
    assert.equal(json[0].issue_type, "task");
    assert.deepEqual(json[0].labels, ["Sandcastle"]);
    assert.equal(json[0].dependency_count, 0);
    assert.deepEqual(json[0].dependencies, []);
  });

  test("maps blockedBy to dependencies with correct structure", () => {
    const tickets: TicketFile[] = [
      {
        id: "03",
        title: "Drawer",
        content: "# 03: Drawer",
        blockedBy: ["01", "02"],
        filename: "03-drawer.md",
      },
    ];

    const json = JSON.parse(ticketsToReadyJson(tickets));

    assert.equal(json[0].dependency_count, 2);
    assert.deepEqual(json[0].dependencies, [
      { issue_id: "ticket-03", depends_on_id: "ticket-01", type: "blocks" },
      { issue_id: "ticket-03", depends_on_id: "ticket-02", type: "blocks" },
    ]);
  });
});

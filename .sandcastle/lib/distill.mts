// Ticket distillation — strip tracker-specific noise from issue details
// before injecting into agent prompts.
//
// Each tracker has its own output format. The distiller for each tracker
// removes metadata, dependency sections, and chrome that agents don't need.
// The generic distillIssueDetails applies structural compression on top.

/** Strip beads `bd show` noise: header, metadata, timestamps, dep sections, tips. */
export function distillBeads(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let skip = false;
  let inDescSubsection = false; // inside a ## Parent or ## Blocked by block

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trimEnd();

    // Single-line noise patterns
    // Header: ○ id · title   [P2 · OPEN]
    if (/^[○●✓✗] .+\[P\d+ · \w+\]/.test(trimmed)) continue;
    // Metadata: Created by: ... · Type: ...
    if (/^Created by: .+ · Type: /.test(trimmed)) continue;
    // Timestamps: Created: YYYY-MM-DD · Updated: YYYY-MM-DD
    if (/^Created: \d{4}-\d{2}-\d{2} · Updated: \d{4}-\d{2}-\d{2}/.test(trimmed)) continue;
    // DESCRIPTION label (standalone)
    if (/^DESCRIPTION$/.test(trimmed)) continue;
    // Beads tips
    if (/^💡 Tip:/.test(trimmed)) continue;

    // Top-level section skipping: LABELS, PARENT, BLOCKS, DEPENDS ON
    if (/^LABELS:/.test(trimmed)) {
      skip = true;
      continue;
    }
    if (/^(?:PARENT|BLOCKS|DEPENDS ON)$/.test(trimmed)) {
      skip = true;
      continue;
    }
    // End skip on next top-level section header or non-indented non-empty line
    // that isn't part of the skipped content (indented lines with ↑ ← → ✓ are content)
    if (skip) {
      if (trimmed === "") {
        // Blank line might end the section, but sections can have internal blanks.
        // Check if the next non-blank line is a new top-level section or end of content.
        continue;
      }
      if (/^[ \t]/.test(line) || /^[↑←→✓○●✗]/.test(trimmed)) {
        // Indented or dependency-marker line — still in the skipped section
        continue;
      }
      // Non-indented, non-empty line that's not a dependency marker — new section
      skip = false;
      // Fall through to process this line
    }

    // Indented description subsections: ## Parent, ## Blocked by
    if (/^\s+## Parent\b/.test(line)) {
      inDescSubsection = true;
      continue;
    }
    if (/^\s+## Blocked by\b/.test(line)) {
      inDescSubsection = true;
      continue;
    }
    if (inDescSubsection) {
      // End when we hit another ## heading or leave the indented block
      if (/^\s+## /.test(line) && !/^\s+## Parent\b/.test(line) && !/^\s+## Blocked by\b/.test(line)) {
        inDescSubsection = false;
        // Fall through to include this line
      } else if (/^\S/.test(line) && trimmed !== "") {
        // Left the indented block entirely
        inDescSubsection = false;
        // Fall through to include this line
      } else {
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

/** Strip markdown ticket file noise: title header, blocked-by, status. */
export function distillMarkdownTicket(raw: string): string {
  return raw
    .replace(/^# \d+:.*$/m, "")
    .replace(/^\*\*Blocked by:\*\*.*$/m, "")
    .replace(/^\*\*Status:\*\*.*$/m, "");
}

/**
 * Apply tracker-specific distillation (if provided) then structural compression.
 * Without a distiller, behaves identically to the old compressIssueDetails.
 */
export function distillIssueDetails(
  raw: string,
  distiller?: (s: string) => string,
): string {
  const afterDistill = distiller ? distiller(raw) : raw;
  return afterDistill
    .replace(/[ \t]+$/gm, "")   // strip trailing padding on every line
    .replace(/\n{3,}/g, "\n\n") // collapse 3+ blank lines to one
    .trim();
}

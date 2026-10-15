// Markdown ticket file reader — alternative to beads for --tickets mode.

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface TicketFile {
  id: string;
  title: string;
  content: string;
  blockedBy: string[];
  filename: string;
}

/** Read all .md files from a tickets directory and parse them. */
export function readTicketFiles(dir: string): TicketFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((filename) => {
      const content = readFileSync(join(dir, filename), "utf8");
      const id =
        filename.match(/^(\d+)/)?.[1] ?? filename.replace(/\.md$/, "");
      const titleMatch = content.match(/^#\s+\d+:\s+(.+)/m);
      const title = titleMatch?.[1]?.trim() ?? filename;
      const blockedMatch = content.match(/\*\*Blocked by:\*\*\s*(.+)/);
      const blockedBy: string[] = [];
      if (blockedMatch && !/none/i.test(blockedMatch[1])) {
        for (const m of Array.from(blockedMatch[1].matchAll(/(\d+)/g))) {
          blockedBy.push(m[1]);
        }
      }
      return { id, title, content, blockedBy, filename };
    });
}

/** Convert parsed ticket files to the JSON format the planner expects. */
export function ticketsToReadyJson(tickets: TicketFile[]): string {
  const issues = tickets.map((t) => ({
    id: `ticket-${t.id}`,
    title: t.title,
    description: t.content,
    status: "open",
    priority: 2,
    issue_type: "task",
    labels: ["Sandcastle"],
    dependencies: t.blockedBy.map((dep) => ({
      issue_id: `ticket-${t.id}`,
      depends_on_id: `ticket-${dep}`,
      type: "blocks",
    })),
    dependency_count: t.blockedBy.length,
  }));
  return JSON.stringify(issues, null, 2);
}

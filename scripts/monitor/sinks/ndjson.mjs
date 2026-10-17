/**
 * NDJSON sink for the rules monitoring system.
 * Zero-dependency, append-only. One file per day: <dir>/<YYYY-MM-DD>.jsonl
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {object} config - Monitor config object (needs config.ndjson.dir)
 * @returns {import('./sink.mjs').Sink}
 */
export function createNdjsonSink(config) {
  const dir = config.ndjson.dir;
  let dirCreated = false;

  function ensureDir() {
    if (!dirCreated) {
      mkdirSync(dir, { recursive: true });
      dirCreated = true;
    }
  }

  function todayFile() {
    return join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  }

  return {
    write(event) {
      ensureDir();
      appendFileSync(todayFile(), JSON.stringify(event) + '\n');
    },

    query(filter) {
      let files;
      try {
        files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort();
      } catch {
        return [];
      }

      if (files.length === 0) return [];

      // Date range filter on filenames (YYYY-MM-DD.jsonl)
      if (filter.from || filter.to) {
        files = files.filter(f => {
          const date = f.replace('.jsonl', '');
          if (filter.from && date < filter.from) return false;
          if (filter.to && date > filter.to) return false;
          return true;
        });
      }

      const events = [];
      for (const file of files) {
        const content = readFileSync(join(dir, file), 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (matchesFilter(event, filter)) {
              events.push(event);
            }
          } catch {
            // Skip corrupted lines
          }
        }
      }

      return events;
    },

    close() {
      // No persistent handles to release
    },
  };
}

function matchesFilter(event, filter) {
  if (filter.tier && event.tier !== filter.tier) return false;
  if (filter.ruleId && event.ruleId !== filter.ruleId) return false;
  if (filter.sessionId && event.sessionId !== filter.sessionId) return false;
  if (filter.from && event.timestamp < filter.from) return false;
  if (filter.to && event.timestamp < filter.to && !event.timestamp.startsWith(filter.to)) return false;
  return true;
}

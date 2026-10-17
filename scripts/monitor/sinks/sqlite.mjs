/**
 * SQLite sink for the rules monitoring system.
 * Uses node:sqlite (experimental on Node 22). Optional — NDJSON is the default.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * @param {object} config - Monitor config object (needs config.sqlite.path)
 * @returns {import('./sink.mjs').Sink}
 */
export function createSqliteSink(config) {
  const { DatabaseSync } = loadSqlite();
  const dbPath = config.sqlite.path;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      tier TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      run_id TEXT,
      turn_index INTEGER NOT NULL,
      file TEXT,
      outcome TEXT NOT NULL,
      agent TEXT,
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tier ON events(tier);
    CREATE INDEX IF NOT EXISTS idx_rule ON events(rule_id);
    CREATE INDEX IF NOT EXISTS idx_session ON events(session_id);
  `);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO events (id, timestamp, tier, rule_id, session_id, run_id, turn_index, file, outcome, agent, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let closed = false;

  return {
    write(event) {
      insertStmt.run(
        event.id,
        event.timestamp,
        event.tier,
        event.ruleId,
        event.sessionId,
        event.runId,
        event.turnIndex,
        event.file,
        event.outcome,
        event.agent,
        JSON.stringify(event.details),
      );
    },

    query(filter) {
      const conditions = [];
      const params = [];

      if (filter.tier) { conditions.push('tier = ?'); params.push(filter.tier); }
      if (filter.ruleId) { conditions.push('rule_id = ?'); params.push(filter.ruleId); }
      if (filter.sessionId) { conditions.push('session_id = ?'); params.push(filter.sessionId); }
      if (filter.from) { conditions.push('timestamp >= ?'); params.push(filter.from); }
      if (filter.to) { conditions.push("timestamp < datetime(?, '+1 day')"); params.push(filter.to); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const stmt = db.prepare(`SELECT * FROM events ${where} ORDER BY timestamp`);
      const rows = stmt.all(...params);

      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        tier: row.tier,
        ruleId: row.rule_id,
        sessionId: row.session_id,
        runId: row.run_id,
        turnIndex: row.turn_index,
        file: row.file,
        outcome: row.outcome,
        agent: row.agent,
        details: tryParseJson(row.details),
      }));
    },

    close() {
      if (!closed) {
        db.close();
        closed = true;
      }
    },
  };
}

function loadSqlite() {
  try {
    return require('node:sqlite');
  } catch {
    throw new Error('node:sqlite is not available. Run with --experimental-sqlite or use the ndjson sink.');
  }
}

function tryParseJson(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

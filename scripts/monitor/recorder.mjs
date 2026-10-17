/**
 * Main recording API for the rules monitoring system.
 * Creates a recorder that validates events and dispatches to the configured sink.
 */
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.mjs';
import { createEvent, validateEvent } from './schema.mjs';
import { createNdjsonSink } from './sinks/ndjson.mjs';
import { createSqliteSink } from './sinks/sqlite.mjs';

/**
 * Create a recorder for the given project root.
 * Reads config from .sandcastle/config.json.
 * @param {string} projectRoot
 * @returns {{ record: (fields: object) => { ok: boolean, errors?: string[] }, close: () => void }}
 */
export function createRecorder(projectRoot) {
  const config = loadConfig(projectRoot);

  if (!config.enabled) {
    return { record: () => ({ ok: true }), close: () => {} };
  }

  const sessionId = process.env.CLAUDE_SESSION_ID || randomUUID();
  const runId = process.env.SANDCASTLE_RUN_ID || null;
  let turnCounter = 0;
  let sink = null;

  function getSink() {
    if (!sink) {
      sink = createSinkFromConfig(config);
    }
    return sink;
  }

  return {
    record(fields) {
      const turnIndex = fields.turnIndex ?? turnCounter++;
      const event = createEvent({
        ...fields,
        sessionId: fields.sessionId || sessionId,
        runId: fields.runId ?? runId,
        turnIndex,
      });

      const validation = validateEvent(event);
      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }

      getSink().write(event);
      return { ok: true };
    },

    close() {
      if (sink) {
        sink.close();
        sink = null;
      }
    },
  };
}

function createSinkFromConfig(config) {
  switch (config.sink) {
    case 'ndjson':
      return createNdjsonSink(config);
    case 'sqlite':
      return createSqliteSink(config);
    default:
      // Custom sink path — must be loaded async, but for now fall back to ndjson
      // TODO: support async custom sink loading
      console.error(`monitor: custom sink "${config.sink}" not yet supported in sync context, falling back to ndjson`);
      return createNdjsonSink(config);
  }
}


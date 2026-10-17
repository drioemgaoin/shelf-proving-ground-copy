/**
 * Configuration loader for the rules monitoring system.
 * Reads from .sandcastle/config.json → monitor key.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULTS = Object.freeze({
  enabled: true,
  sink: 'ndjson',
  ndjson: Object.freeze({ dir: '.sandcastle/logs/monitor' }),
  sqlite: Object.freeze({ path: '.sandcastle/logs/monitor.db' }),
});

const BUILTIN_SINKS = new Set(['ndjson', 'sqlite']);

/**
 * Load monitor configuration from project root.
 * @param {string} projectRoot
 * @returns {object}
 */
export function loadConfig(projectRoot) {
  const configPath = join(projectRoot, '.sandcastle', 'config.json');

  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return { ...DEFAULTS };
  }

  const monitor = raw?.monitor;
  if (!monitor || typeof monitor !== 'object') {
    return { ...DEFAULTS };
  }

  const merged = {
    enabled: monitor.enabled ?? DEFAULTS.enabled,
    sink: monitor.sink ?? DEFAULTS.sink,
    ndjson: { ...DEFAULTS.ndjson, ...monitor.ndjson },
    sqlite: { ...DEFAULTS.sqlite, ...monitor.sqlite },
  };

  // Resolve custom sink paths (not built-in names)
  if (!BUILTIN_SINKS.has(merged.sink)) {
    merged.sink = resolve(projectRoot, merged.sink);
  }

  return merged;
}

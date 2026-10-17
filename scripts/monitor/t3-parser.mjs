/**
 * T3 structured output parser for the rules monitoring system.
 * Extracts evaluation results from T3 agent output between markers.
 */

const START_MARKER = '<!-- MONITOR_REPORT_START -->';
const END_MARKER = '<!-- MONITOR_REPORT_END -->';

/**
 * Parse T3 agent output for structured evaluation results.
 * @param {string} text - Full agent output text
 * @param {string} agent - Agent type ('visual-qa' or 'reviewer')
 * @returns {{ ruleId: string, outcome: string, file?: string, agent: string, details: object }[]}
 */
export function parseT3Output(text, agent) {
  const startIdx = text.indexOf(START_MARKER);
  const endIdx = text.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return [];
  }

  const jsonStr = text.slice(startIdx + START_MARKER.length, endIdx).trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('monitor: T3 parser: malformed JSON in MONITOR_REPORT block');
    return [];
  }

  if (!Array.isArray(parsed.evaluations)) {
    return [];
  }

  return parsed.evaluations.map(e => ({
    ruleId: e.ruleId,
    outcome: e.outcome,
    file: e.file ?? null,
    agent,
    details: e.details ?? {},
  }));
}

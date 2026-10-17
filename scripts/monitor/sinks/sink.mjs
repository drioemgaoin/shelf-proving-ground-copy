/**
 * Sink interface for the rules monitoring system.
 *
 * Every sink must export a factory function that returns an object with:
 *
 * @typedef {object} Sink
 * @property {(event: object) => void} write - Persist one event.
 * @property {(filter: SinkFilter) => object[]} query - Return matching events.
 * @property {() => void} close - Flush and release resources.
 *
 * @typedef {object} SinkFilter
 * @property {string} [tier] - Filter by tier (T1, T2, T3).
 * @property {string} [ruleId] - Filter by rule ID.
 * @property {string} [sessionId] - Filter by session ID.
 * @property {string} [from] - ISO 8601 start date (inclusive).
 * @property {string} [to] - ISO 8601 end date (inclusive).
 */

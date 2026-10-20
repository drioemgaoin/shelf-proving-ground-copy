/**
 * Event schema for the rules monitoring system.
 * Defines the event shape, factory, validation, and enums.
 */
import { randomUUID } from 'node:crypto';

/** @type {readonly string[]} */
export const TIERS = Object.freeze(['T1', 'T2', 'T3']);

/** @type {readonly string[]} */
export const OUTCOMES = Object.freeze(['blocked', 'passed', 'violation_found', 'fixed']);

/** @type {readonly string[]} */
export const AGENTS = Object.freeze(['implementer', 'visual-qa', 'reviewer']);

/**
 * Create a monitoring event, filling defaults for id and timestamp.
 * @param {object} fields
 * @returns {object}
 */
export function createEvent(fields) {
  return {
    id: fields.id ?? randomUUID(),
    timestamp: fields.timestamp ?? new Date().toISOString(),
    tier: fields.tier,
    ruleId: fields.ruleId,
    sessionId: fields.sessionId,
    runId: fields.runId ?? null,
    turnIndex: fields.turnIndex,
    file: fields.file ?? null,
    outcome: fields.outcome,
    agent: fields.agent ?? null,
    details: fields.details ?? {},
  };
}

/**
 * Validate a monitoring event.
 * @param {object} event
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEvent(event) {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['event must be an object'] };
  }

  if (!event.tier || !TIERS.includes(event.tier)) {
    errors.push(`tier must be one of ${TIERS.join(', ')}, got "${event.tier}"`);
  }

  if (!event.ruleId || typeof event.ruleId !== 'string') {
    errors.push('ruleId is required and must be a string');
  }

  if (!event.sessionId || typeof event.sessionId !== 'string') {
    errors.push('sessionId is required and must be a string');
  }

  if (typeof event.turnIndex !== 'number' || event.turnIndex < 0) {
    errors.push('turnIndex must be a non-negative number');
  }

  if (!event.outcome || !OUTCOMES.includes(event.outcome)) {
    errors.push(`outcome must be one of ${OUTCOMES.join(', ')}, got "${event.outcome}"`);
  }

  if (!event.id || typeof event.id !== 'string') {
    errors.push('id is required and must be a string');
  }

  if (!event.timestamp || typeof event.timestamp !== 'string' || !event.timestamp.includes('T')) {
    errors.push('timestamp must be a valid ISO 8601 string');
  }

  if (event.agent != null && !AGENTS.includes(event.agent)) {
    errors.push(`agent must be one of ${AGENTS.join(', ')} or null, got "${event.agent}"`);
  }

  return { valid: errors.length === 0, errors };
}

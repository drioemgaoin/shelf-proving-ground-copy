/**
 * Query API for the rules monitoring system.
 * Wraps a sink's query method with higher-level analytics.
 */

/**
 * @param {import('./sinks/sink.mjs').Sink} sink
 */
export function createQueryApi(sink) {
  return {
    /**
     * Get events matching filter.
     * @param {object} filter
     * @returns {object[]}
     */
    getEvents(filter) {
      return sink.query(filter);
    },

    /**
     * Get aggregated metrics per rule.
     * @param {object} [filter]
     * @returns {{ ruleId: string, tier: string, triggerCount: number, blockCount: number, blockRate: number, fixCount: number, fixRate: number }[]}
     */
    getMetrics(filter = {}) {
      const events = sink.query(filter);
      if (events.length === 0) return [];

      const byRule = new Map();
      for (const e of events) {
        if (!byRule.has(e.ruleId)) {
          byRule.set(e.ruleId, { ruleId: e.ruleId, tier: e.tier, triggers: [], blocks: 0, fixes: 0, byAgent: {} });
        }
        const entry = byRule.get(e.ruleId);
        entry.triggers.push(e);
        if (e.outcome === 'blocked') entry.blocks++;
        if (e.outcome === 'fixed') entry.fixes++;

        // Per-agent breakdown
        const agent = e.agent ?? 'implementer';
        if (!entry.byAgent[agent]) {
          entry.byAgent[agent] = { triggers: 0, blocks: 0, fixes: 0 };
        }
        entry.byAgent[agent].triggers++;
        if (e.outcome === 'blocked') entry.byAgent[agent].blocks++;
        if (e.outcome === 'fixed') entry.byAgent[agent].fixes++;
      }

      return [...byRule.values()].map(entry => ({
        ruleId: entry.ruleId,
        tier: entry.tier,
        triggerCount: entry.triggers.length,
        blockCount: entry.blocks,
        blockRate: entry.triggers.length > 0 ? entry.blocks / entry.triggers.length : 0,
        fixCount: entry.fixes,
        fixRate: entry.blocks > 0 ? entry.fixes / entry.blocks : 0,
        byAgent: entry.byAgent,
      }));
    },

    /**
     * Get rule IDs that have never been triggered.
     * @param {string[]} allRuleIds - All known rule IDs from enforcement blocks
     * @param {object} [filter]
     * @returns {string[]}
     */
    getUnusedRules(allRuleIds, filter = {}) {
      const events = sink.query(filter);
      const triggered = new Set(events.map(e => e.ruleId));
      return allRuleIds.filter(id => !triggered.has(id));
    },

    /**
     * Get fix correlation for a specific rule.
     * Checks how often a blocked event is followed by a fixed event
     * at the next turn for the same rule+file+session.
     * @param {string} ruleId
     * @param {object} [filter]
     * @returns {{ blocked: number, fixedNextTurn: number, fixRate: number }}
     */
    getFixCorrelation(ruleId, filter = {}) {
      const events = sink.query({ ...filter, ruleId });
      const blocked = events.filter(e => e.outcome === 'blocked');
      const fixed = events.filter(e => e.outcome === 'fixed');

      let fixedNextTurn = 0;
      for (const b of blocked) {
        const hasFix = fixed.some(f =>
          f.sessionId === b.sessionId &&
          f.file === b.file &&
          f.turnIndex === b.turnIndex + 1
        );
        if (hasFix) fixedNextTurn++;
      }

      return {
        blocked: blocked.length,
        fixedNextTurn,
        fixRate: blocked.length > 0 ? fixedNextTurn / blocked.length : 0,
      };
    },
  };
}

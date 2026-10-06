# Skill Benchmark: rule-creator

**Model**: claude-opus-4-6
**Date**: 2026-10-06
**Evals**: 0-10 (1 run each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 70% ± 37% | +30% |
| Time | 181.6s ± 37.4s | 109.7s ± 30.0s | +71.9s |

## Per-Eval Breakdown

| Eval | With Skill | Without Skill | Delta |
|------|------------|---------------|-------|
| 0 - Python T1 basics | 100% | 50% | +50% |
| 1 - API T2/Human boundary | 100% | 100% | +0% |
| 2 - Go syntactic proxies | 100% | 100% | +0% |
| 3 - Batch mode (15 rules) | 100% | 14% | +86% |
| 4 - Budget pressure | 100% | 100% | +0% |
| 5 - Adjective trap | 100% | 0% | +100% |
| 6 - New rule creation | 100% | 43% | +57% |
| 7 - T3 agent selection | 100% | 83% | +17% |
| 8 - T3 instruction quality | 100% | 100% | +0% |
| 9 - Edit/reclassify | 100% | 83% | +17% |
| 10 - Multi-file budget | 100% | 100% | +0% |

## Analyst Notes

- **Non-discriminating evals (4 of 11):** Evals 1, 2, 4, 8, 10 score 100% in both configurations. The baseline model is already strong at tier classification and instruction quality. These assertions test domain reasoning rather than skill-specific process.
- **Strongest discriminators:** Eval 5 (adjective trap: +100pp) and eval 3 (batch mode: +86pp) show the largest skill advantage. The adjective trap is entirely skill-taught; batch grouping is a workflow the baseline never adopts.
- **Skill overhead:** With-skill runs average ~72s longer due to reading skill + references + running budget checks. This is a consistent cost across all evals.
- **100% with-skill pass rate:** All 67 assertions pass. Compared to iteration-8 which had eval-10 at 83%, this run shows improvement.

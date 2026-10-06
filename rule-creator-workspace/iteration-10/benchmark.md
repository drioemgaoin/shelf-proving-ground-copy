# Skill Benchmark: rule-creator

**Model**: claude-opus-4-6
**Date**: 2026-10-06
**Evals**: 0-10 (1 run each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% | 67% | +33% |
| Time | 97.5s | 82.4s | +15.1s |

## Per-Eval Breakdown

| Eval | With Skill | Without Skill | Delta |
|------|------------|---------------|-------|
| 0 - Python T1 Basics | 100% | 17% | +83% |
| 1 - Api T2 Human Boundary | 100% | 83% | +17% |
| 2 - Go Syntactic Proxies | 100% | 83% | +17% |
| 3 - Batch Mode 15 Rules | 100% | 14% | +86% |
| 4 - Budget Pressure | 100% | 100% | +0% |
| 5 - Adjective Trap | 100% | 33% | +67% |
| 6 - New Rule Creation | 100% | 57% | +43% |
| 7 - T3 Agent Selection | 100% | 83% | +17% |
| 8 - T3 Instruction Quality | 100% | 83% | +17% |
| 9 - Edit Reclassify | 100% | 83% | +17% |
| 10 - Multi File Budget | 100% | 100% | +0% |

## Analyst Notes

- **Non-discriminating evals:** Evals 4 and 10 score 100% in both configs. The baseline model handles budget awareness and cross-file aggregation well on its own.
- **Strongest discriminators:** Eval 5 (adjective trap: +67pp) and eval 3 (batch mode: +86pp). The adjective trap is skill-taught; batch grouping is a workflow the baseline never adopts.
- **Eval 7 regression vs iter-9:** Without-skill changed functions-over-50-lines from T1 to T3 reviewer (over-classification). The skill prevents this tier inflation.
- **Permission issue:** All subagents hit Write/Bash denials. Grading based on task notification transcripts. This is consistent across both configs so doesn't bias results.
- **Skill overhead:** With-skill runs average ~15.1s longer due to reading skill + references + budget checks.

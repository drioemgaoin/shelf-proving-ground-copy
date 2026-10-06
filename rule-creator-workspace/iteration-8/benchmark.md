# Skill Benchmark: rule-creator

**Model**: claude-opus-4-6
**Date**: 2026-10-06
**Evals**: 0-10 (1 run each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 98% ± 5% | 49% ± 35% | +49% |
| Time | 105.7s ± 25.0s | 71.7s ± 18.2s | +34.0s |

## Per-Eval Breakdown

| Eval | With Skill | Without Skill | Delta |
|------|------------|---------------|-------|
| 0 - Python T1 basics | 100% | 33% | +67% |
| 1 - API T2/Human boundary | 100% | 33% | +67% |
| 2 - Go syntactic proxies | 100% | 17% | +83% |
| 3 - Batch mode (15 rules) | 100% | 14% | +86% |
| 4 - Budget pressure | 100% | 100% | +0% |
| 5 - Adjective trap | 100% | 0% | +100% |
| 6 - New rule creation | 100% | 29% | +71% |
| 7 - T3 agent selection | 100% | 83% | +17% |
| 8 - T3 instruction quality | 100% | 100% | +0% |
| 9 - Edit/reclassify | 100% | 67% | +33% |
| 10 - Multi-file budget | 83% | 67% | +16% |

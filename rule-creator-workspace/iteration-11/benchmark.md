# Skill Benchmark: rule-creator

**Model**: claude-opus-4-6
**Date**: 2026-10-06
**Evals**: 0-10 (1 run each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 98% ± 5% | 34% ± 16% | +64.3% |
| Time | 111.1s ± 31.0s | 65.9s ± 27.6s | +45.2s |

## Per-Eval Breakdown

| Eval | With Skill | Without Skill | Delta |
|------|------------|---------------|-------|
| 0 - Python T1 basics | 83% | 17% | +66% |
| 1 - API T2/Human boundary | 100% | 33% | +67% |
| 2 - Go syntactic proxies | 100% | 17% | +83% |
| 3 - Batch mode (15 rules) | 100% | 14% | +86% |
| 4 - Budget pressure | 100% | 67% | +33% |
| 5 - Adjective trap | 100% | 33% | +67% |
| 6 - New rule creation | 100% | 29% | +71% |
| 7 - T3 agent selection | 100% | 33% | +67% |
| 8 - T3 instruction quality | 100% | 50% | +50% |
| 9 - Edit/reclassify | 100% | 50% | +50% |
| 10 - Multi-file budget | 100% | 33% | +67% |

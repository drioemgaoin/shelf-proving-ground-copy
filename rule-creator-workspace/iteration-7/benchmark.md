# Skill Benchmark: rule-creator

**Model**: claude-opus-4-6
**Date**: 2026-10-06
**Evals**: 0-10 (1 run each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 98% ± 5% | 54% ± 33% | +0.44 |
| Time | 96.0s ± 24.1s | 63.0s ± 20.8s | +33.3s |

## Per-Eval Breakdown

| Eval | With Skill | Without Skill | Delta |
|------|------------|---------------|-------|
| 0 - Python T1 basics | 100% | 50% | +50% |
| 1 - API T2/Human boundary | 100% | 50% | +50% |
| 2 - Go syntactic proxies | 100% | 17% | +83% |
| 3 - Batch mode (15 rules) | 100% | 14% | +86% |
| 4 - Budget pressure | 100% | 83% | +17% |
| 5 - Adjective trap | 83% | 0% | +83% |
| 6 - New rule creation | 100% | 43% | +57% |
| 7 - T3 agent selection | 100% | 83% | +17% |
| 8 - T3 instruction quality | 100% | 100% | +0% |
| 9 - Edit/reclassify | 100% | 83% | +17% |
| 10 - Multi-file budget | 100% | 67% | +33% |

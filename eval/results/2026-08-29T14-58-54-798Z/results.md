# CareLoop evaluation results

- **Run started:** 2026-08-29T14:58:54.798Z
- **Provider:** mock
- **Models:** fast=gpt-4o-mini, strong=gpt-4o
- **Cases:** 3 synthetic cases (`eval/cases.json`)
- **Note:** MOCK PROVIDER — these numbers are not real results.

## Headline comparison

| Metric | baseline | agent-no-verify | agent |
|---|---|---|---|
| Care-pathway accuracy | 0.0% | 66.7% | 66.7% |
| **Critical miss rate** (RED routed elsewhere) | **100.0%** | **0.0%** | **0.0%** |
| RED cases caught | 0 / 2 | 2 / 2 | 2 / 2 |
| Under-triage rate (all cases) | 66.7% | 0.0% | 0.0% |
| Over-triage rate (all cases) | 33.3% | 33.3% | 33.3% |
| Required-info completeness | 0.0% | 11.1% | 11.1% |
| Avg latency per case | 0.0s | 0.0s | 0.0s |
| Avg cost per case | $0.0000 | $0.0000 | $0.0000 |
| Total cost | $0.0000 | $0.0000 | $0.0000 |
| Avg patient turns | 1.0 | 1.0 | 1.0 |
| Errors | 0 | 0 | 0 |

## Per-case results

| Case | Category | Expected | baseline | agent-no-verify | agent |
|---|---|---|---|---|---|
| `headache-tension` | straightforward | GREEN | YELLOW ✗ | RED ✗ | RED ✗ |
| `headache-thunderclap` | needs-followup | RED | YELLOW ✗✗ | RED ✓ | RED ✓ |
| `stroke-resolving` | high-risk | RED | YELLOW ✗✗ | RED ✓ | RED ✓ |

`✓` correct · `✗` wrong · `✗✗` a RED case routed somewhere other than RED.

## Critical misses

- **baseline** on `headache-thunderclap`: expected RED, returned YELLOW.
  - Never captured: sudden onset, worst headache, vomiting, neck stiffness
- **baseline** on `stroke-resolving`: expected RED, returned YELLOW.
  - Never captured: arm weakness, facial droop, slurred speech

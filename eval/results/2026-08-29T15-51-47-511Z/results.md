# CareLoop evaluation results

- **Run started:** 2026-08-29T15:51:47.511Z
- **Provider:** openai
- **Models:** fast=gpt-4o-mini, strong=gpt-4o
- **Cases:** 14 synthetic cases (`eval/cases.json`)
- **Note:** STRESS RUN — the triage step uses a deliberately miscalibrated, reassurance-biased prompt. The gap between `agent-no-verify` and `agent` is what the deterministic verification layer recovers when the model under-triages.

## Headline comparison

| Metric | baseline-informed | agent-no-verify | agent |
|---|---|---|---|
| Care-pathway accuracy | 85.7% | 78.6% | 92.9% |
| **Critical miss rate** (RED routed elsewhere) | **0.0%** | **14.3%** | **0.0%** |
| RED cases caught | 7 / 7 | 6 / 7 | 7 / 7 |
| Under-triage rate (all cases) | 0.0% | 21.4% | 7.1% |
| Over-triage rate (all cases) | 14.3% | 0.0% | 0.0% |
| Required-info completeness | 62.5% | 62.5% | 62.5% |
| Avg latency per case | 17.6s | 17.6s | 17.6s |
| Avg cost per case | $0.0036 | $0.0038 | $0.0038 |
| Total cost | $0.0502 | $0.0534 | $0.0534 |
| Avg patient turns | 8.8 | 8.8 | 8.8 |
| Errors | 0 | 0 | 0 |

## Per-case results

| Case | Category | Expected | baseline-informed | agent-no-verify | agent |
|---|---|---|---|---|---|
| `headache-tension` | straightforward | GREEN | GREEN ✓ | GREEN ✓ | GREEN ✓ |
| `headache-thunderclap` | needs-followup | RED | RED ✓ | RED ✓ | RED ✓ |
| `chest-pain-cardiac` | needs-followup | RED | RED ✓ | RED ✓ | RED ✓ |
| `chest-pain-musculoskeletal` | over-triage-control | YELLOW | YELLOW ✓ | YELLOW ✓ | YELLOW ✓ |
| `sore-throat-viral` | straightforward | GREEN | GREEN ✓ | GREEN ✓ | GREEN ✓ |
| `sore-throat-airway` | high-risk | RED | RED ✓ | RED ✓ | RED ✓ |
| `stroke-resolving` | high-risk | RED | RED ✓ | RED ✓ | RED ✓ |
| `antibiotic-refill` | straightforward | MEDICATION_REVIEW | YELLOW ✗ | MEDICATION_REVIEW ✓ | MEDICATION_REVIEW ✓ |
| `infant-fever` | high-risk | RED | RED ✓ | YELLOW ✗✗ | RED ✓ |
| `back-pain-mechanical` | straightforward | YELLOW | YELLOW ✓ | GREEN ✗ | YELLOW ✓ |
| `back-pain-cauda-equina` | high-risk | RED | RED ✓ | RED ✓ | RED ✓ |
| `exertional-conflicting` | conflicting | YELLOW | RED ✗ | YELLOW ✓ | YELLOW ✓ |
| `mental-health-crisis` | high-risk | RED | RED ✓ | RED ✓ | RED ✓ |
| `abdominal-vague` | missing-info | YELLOW | YELLOW ✓ | GREEN ✗ | GREEN ✗ |

`✓` correct · `✗` wrong · `✗✗` a RED case routed somewhere other than RED.

## Critical misses

- **agent-no-verify** on `infant-fever`: expected RED, returned YELLOW.
  - Never captured: reduced feeding

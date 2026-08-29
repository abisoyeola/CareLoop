# CareLoop evaluation results

- **Run started:** 2026-08-29T15:53:52.508Z
- **Provider:** openai
- **Models:** fast=gpt-4o-mini, strong=gpt-4o
- **Cases:** 14 synthetic cases (`eval/cases.json`)
- **Note:** `baseline-informed` is the single baseline prompt given the transcript the agent gathered — it separates the value of asking questions from the value of the pipeline. `agent-no-verify` is the agent scored before the verification layer.

## Headline comparison

| Metric | baseline | baseline-informed | agent-no-verify | agent |
|---|---|---|---|---|
| Care-pathway accuracy | 42.9% | 85.7% | 85.7% | 85.7% |
| **Critical miss rate** (RED routed elsewhere) | **85.7%** | **0.0%** | **0.0%** | **0.0%** |
| RED cases caught | 1 / 7 | 7 / 7 | 7 / 7 | 7 / 7 |
| Under-triage rate (all cases) | 50.0% | 0.0% | 0.0% | 0.0% |
| Over-triage rate (all cases) | 7.1% | 14.3% | 14.3% | 14.3% |
| Required-info completeness | 9.5% | 57.7% | 57.7% | 57.7% |
| Avg latency per case | 2.0s | 17.4s | 17.4s | 17.4s |
| Avg cost per case | $0.0018 | $0.0035 | $0.0044 | $0.0044 |
| Total cost | $0.0259 | $0.0495 | $0.0616 | $0.0616 |
| Avg patient turns | 1.0 | 8.6 | 8.6 | 8.6 |
| Errors | 0 | 0 | 0 | 0 |

## Per-case results

| Case | Category | Expected | baseline | baseline-informed | agent-no-verify | agent |
|---|---|---|---|---|---|---|
| `headache-tension` | straightforward | GREEN | GREEN ✓ | GREEN ✓ | GREEN ✓ | GREEN ✓ |
| `headache-thunderclap` | needs-followup | RED | YELLOW ✗✗ | RED ✓ | RED ✓ | RED ✓ |
| `chest-pain-cardiac` | needs-followup | RED | RED ✓ | RED ✓ | RED ✓ | RED ✓ |
| `chest-pain-musculoskeletal` | over-triage-control | YELLOW | RED ✗ | RED ✗ | RED ✗ | RED ✗ |
| `sore-throat-viral` | straightforward | GREEN | GREEN ✓ | GREEN ✓ | GREEN ✓ | GREEN ✓ |
| `sore-throat-airway` | high-risk | RED | YELLOW ✗✗ | RED ✓ | RED ✓ | RED ✓ |
| `stroke-resolving` | high-risk | RED | GREEN ✗✗ | RED ✓ | RED ✓ | RED ✓ |
| `antibiotic-refill` | straightforward | MEDICATION_REVIEW | MEDICATION_REVIEW ✓ | YELLOW ✗ | YELLOW ✗ | YELLOW ✗ |
| `infant-fever` | high-risk | RED | YELLOW ✗✗ | RED ✓ | RED ✓ | RED ✓ |
| `back-pain-mechanical` | straightforward | YELLOW | YELLOW ✓ | YELLOW ✓ | YELLOW ✓ | YELLOW ✓ |
| `back-pain-cauda-equina` | high-risk | RED | YELLOW ✗✗ | RED ✓ | RED ✓ | RED ✓ |
| `exertional-conflicting` | conflicting | YELLOW | GREEN ✗ | YELLOW ✓ | YELLOW ✓ | YELLOW ✓ |
| `mental-health-crisis` | high-risk | RED | YELLOW ✗✗ | RED ✓ | RED ✓ | RED ✓ |
| `abdominal-vague` | missing-info | YELLOW | YELLOW ✓ | YELLOW ✓ | YELLOW ✓ | YELLOW ✓ |

`✓` correct · `✗` wrong · `✗✗` a RED case routed somewhere other than RED.

## Critical misses

- **baseline** on `headache-thunderclap`: expected RED, returned YELLOW.
  - Never captured: sudden onset, worst headache, vomiting, neck stiffness
- **baseline** on `sore-throat-airway`: expected RED, returned YELLOW.
  - Never captured: drooling, cannot swallow, muffled voice, difficulty breathing
- **baseline** on `stroke-resolving`: expected RED, returned GREEN.
  - Never captured: arm weakness, facial droop, slurred speech
- **baseline** on `infant-fever`: expected RED, returned YELLOW.
  - Never captured: six weeks old, 38.4, reduced feeding
- **baseline** on `back-pain-cauda-equina`: expected RED, returned YELLOW.
  - Never captured: saddle numbness, urinary retention, bilateral leg weakness
- **baseline** on `mental-health-crisis`: expected RED, returned YELLOW.
  - Never captured: suicidal ideation, has a plan, has means

# CareLoop

**An AI care-navigation platform: structured patient intake, verified preliminary triage, and human clinical review — with the pharmacy loop closed.**

Built for the micro1 Agentic Workflows Hackathon. Everything in this repository was
written for the competition; the only pre-existing pieces are the framework
scaffold (`create-next-app`) and the open-source libraries in `package.json`.

- **Reproduce it:** [`REPRODUCTION.md`](REPRODUCTION.md)
- **How it got here:** [`CHANGELOG.md`](CHANGELOG.md)
- **Agent trajectories:** `eval/results/<timestamp>/trajectories/`

---

## Who has this problem

Two people, at opposite ends of the same conversation.

**The patient** has a symptom and no idea what it means. They know how it feels;
they do not know which facts about it matter. Nobody has ever told them that
whether a headache came on *gradually* or *in a single second* is the difference
between paracetamol and a brain haemorrhage. So they either sit on something
dangerous, or they spend six hours in A&E with a sore throat.

**The clinician** receives "patient reports headache" and starts from zero. The
first several minutes of every consultation are spent collecting information that
could have been collected before they arrived — duration, severity, associated
symptoms, medications, allergies — which is time not spent on the judgement only
they can make.

## The bottleneck

**An unstructured patient conversation has to become a structured care request,
and doing that well requires knowing which follow-up question to ask next.**

That is a genuinely hard thing to automate, and it is where a naive chatbot fails
in a way that is easy to miss. Consider two patients who open with the identical
sentence:

> "I've got a really bad headache."

One has been at a laptop for nine hours. The other has a subarachnoid haemorrhage.
Nothing in that sentence separates them. The separation only exists in the answers
to questions nobody has asked yet — did it come on suddenly, have you vomited, is
your neck stiff.

A single-prompt chatbot answers the sentence. It cannot do anything else, because
the sentence is all it will ever see. The failure is silent: it produces a
confident, well-written, reasonable-sounding reply, and routes a bleed to self-care.

## Why solving it is worth something

Under-triage is the only error here that harms anyone. Sending a sore throat to a
clinician wastes a few minutes of clinician time. Sending a resolving stroke to
self-care wastes the treatment window. Any system in this space should be measured
primarily on the second kind of mistake, and most accuracy metrics quietly average
it away with the first.

---

## What was built

A working closed-loop platform, not a demo script:

| Role | What they can do |
|---|---|
| **Patient** | Register, run an adaptive AI health chat, upload a photo or a test result, receive a preliminary care pathway, request a clinician, message them, choose a verified pharmacy, track fulfilment |
| **Clinician** | Register (verification required), work a priority-ordered queue, read the structured summary plus the full AI conversation, see exactly what the safety layer did, message the patient, issue prescriptions, confirm or overrule the AI pathway |
| **Pharmacy** | Register (verification required), work a fulfilment queue, see reported allergies, accept or reject with a reason, move orders through to collection or delivery |
| **Admin** | Verify clinicians and pharmacies, watch the pathway distribution for drift, read the audit trail |

Everything is realtime over one Socket.IO connection: a queued case reaches every
clinician instantly, messages arrive without a refresh, and the patient's
fulfilment tracker advances as the pharmacy clicks.

---

## How the agent works, and why it is shaped this way

```
patient message
      │
      ▼
┌──────────────────┐   asks ONE adaptive question at a time; stops early and
│ Conversation     │   immediately if anything urgent surfaces, rather than
│ Agent            │   continuing to interview someone having a stroke
└────────┬─────────┘
         │  (assessment lock)
         ▼
┌──────────────────┐   conversation → structured summary. Separate call, so a
│ Extraction Agent │   confident narrative cannot drag the decision with it
└────────┬─────────┘
         ▼
┌──────────────────┐   summary → GREEN / YELLOW / MEDICATION_REVIEW / RED
│ Triage Agent     │
└────────┬─────────┘
         ▼
┌══════════════════┐   ★ NOT a model. Deterministic red-flag rules over the
║ Verification     ║     transcript. Can RAISE the pathway. Structurally
║ Layer            ║     cannot lower it. Records what it did and why.
└════════┬═════════┘
         ▼
   care pathway ──────► human clinician ──────► prescription ──────► pharmacy
```

Four design decisions carried the result. Each has its own changelog entry with
the evidence that motivated it.

### 1. The rules can escalate and cannot de-escalate

`applyFloor` takes `max(model pathway, rules pathway)`. There is no code path that
lowers a pathway, so a model that under-triages gets caught, while a model that
over-triages is never "corrected" downward by a regex. The asymmetry is the whole
point: the two errors have wildly different costs and should not be treated
symmetrically.

When the layer overrides the model, the patient sees it ("Safety rules raised
this"), the clinician sees the model's original answer and the evidence snippet
that triggered the override, and the audit log records both.

### 2. Negation handling, because "no chest pain" is not chest pain

A naive keyword scan fires the cardiac rule on *"she denies any chest pain"*. Every
rule match looks back a six-word window for a negator and drops the match if it
finds one. The `exertional-conflicting` eval case exists specifically to test this:
the patient denies chest pain in one sentence and describes exertional chest
tightness in the next.

### 3. The conversation agent is allowed to stop early

Ordinarily it gathers all six information categories before locking. But if
anything potentially urgent appears, it locks *on that turn* and routes. Continuing
to ask about medication history while someone describes stroke symptoms would be
the wrong behaviour even though it produces a more complete record.

### 4. The AI is structurally excluded from the consequential action

There is no code path by which the agent can create a prescription, pre-fill one,
or authorise a pharmacy to dispense. `POST /api/consultations/:id/prescribe`
requires a verified, assigned, human clinician. Unverified clinician and pharmacy
accounts can sign in and look around, and can do nothing to a patient.
(Hackathon ground rules 04 and 05; seed §12, §17, §21.)

---

## Measured improvement

14 synthetic cases, same cases through every arm, `gpt-4o-mini` + `gpt-4o`.
Regenerate with `npm run eval` (see [`REPRODUCTION.md`](REPRODUCTION.md) §7).

| Metric | baseline | baseline-informed | **agent** |
|---|---|---|---|
| Care-pathway accuracy | 42.9% | 85.7% | **85.7%** |
| **Critical miss rate** (RED routed elsewhere) | **85.7%** | 0.0% | **0.0%** |
| RED cases caught | 1 / 7 | 7 / 7 | **7 / 7** |
| Under-triage rate | 50.0% | 0.0% | 0.0% |
| Over-triage rate | 7.1% | 14.3% | 14.3% |
| Required-info completeness | 9.5% | 57.7% | 57.7% |
| Latency per case | 2.0s | 17.4s | 17.4s |
| Cost per case | $0.0018 | $0.0035 | $0.0044 |
| Patient turns | 1.0 | 8.6 | 8.6 |

The baseline missed **six of seven** RED cases — a subarachnoid haemorrhage, an
airway obstruction, a resolving stroke, a six-week-old with a fever, a cauda
equina, and a patient with a suicide plan — in every run. It answered each
opening sentence fluently and never asked a second question.

The trade is real and stated plainly: **~8× latency, ~2.4× cost, and a higher
over-triage rate.** In this domain that is the correct direction to be wrong.

Three identical runs of one configuration scored 85.7 / 78.6 / 78.6, so ±1 case is
noise. **The critical miss rate was identical in every run** — 85.7% baseline,
0.0% agent.

### What actually caused the gain

`baseline-informed` is the *same single baseline prompt*, handed the transcript the
agent gathered. It matches the full agent exactly. So the improvement is entirely
**information acquisition** — the adaptive questioning — and not the pipeline
structure. That result is uncomfortable and it is in
[`CHANGELOG.md`](CHANGELOG.md) in full.

### What the verification layer is worth

On a well-calibrated model, nothing measurable: it changed zero outcomes across
three runs. That cannot distinguish "unnecessary" from "never called upon", so
`npm run eval -- --arm agent --stress-triage` re-runs the agent against a
deliberately reassurance-biased triage prompt:

| Under a miscalibrated model | agent-no-verify | **agent** |
|---|---|---|
| Care-pathway accuracy | 78.6% | **92.9%** |
| Critical miss rate | 14.3% | **0.0%** |
| Over-triage rate | 21.4% | **0.0%** |

The layer recovers the missed case and costs nothing per run — it makes no model
call. Insurance, priced correctly.

**Dataset:** 14 synthetic cases in [`eval/cases.json`](eval/cases.json) — straightforward,
follow-up-dependent, missing-information, conflicting-information, over-triage
controls, and five high-risk cases. No real patient data is used anywhere in this
repository.

**Design of the comparison.** Both arms face the same simulated patient built from
the same fact sheet. The simulator is instructed to answer only what it is asked
and to volunteer nothing — which is what makes the comparison mean something,
because information has to be *asked for* to be obtained. The baseline gets the
patient's opening message and one prompt. That difference in what each arm may
gather is not an unfairness to be corrected; it is precisely the capability under
test, and the brief asks that such differences be stated plainly rather than
engineered away.

**Metrics.** Care-pathway accuracy (primary), **critical miss rate** (the one that
matters), under- and over-triage rates, required-information completeness, cost
per case, latency per case, patient turns per case.

**Three arms, two executions.** `baseline`, `agent`, and `agent-no-verify` — the
last being the agent run scored on the model's pathway *before* the verification
layer. It comes free from the same execution and isolates exactly what that layer
contributes.

---

## Safety and scope

CareLoop is a **demonstration system**. It is not a medical device. Its triage
rules are hand-written screening heuristics that have **not been reviewed by any
clinician**, and the seed document this project was built from is explicit that
real escalation criteria require qualified sign-off before production use.

In the product itself: the AI never states a diagnosis, never names a medication,
never tells a patient something is nothing to worry about, and every screen that
shows an AI conclusion carries the disclaimer. Uploads that cannot be read
confidently are marked unreadable rather than guessed at, and machine-read values
are always displayed next to the original file for the clinician to check.

---

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Socket.IO on a shared HTTP
listener · MongoDB via Mongoose · JWT session cookies (`jose` + `bcryptjs`) · zod
for the model-output contracts · OpenAI (`gpt-4o-mini` for volume, `gpt-4o` for
triage and vision) behind a provider interface with a deterministic mock.

Deploys to Render as a single web service — [`render.yaml`](render.yaml).

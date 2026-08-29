# Improvement changelog

How CareLoop's triage got from a single prompt to what is in the repository, what
each change was worth, and the two experiments that told me I was wrong about my
own design.

Everything below is measured on the same 14 synthetic cases
([`eval/cases.json`](eval/cases.json)), scored the same way, with the same
simulated patient. Regenerate any row with `npm run eval` — see
[`REPRODUCTION.md`](REPRODUCTION.md) §7.

---

## How to read the numbers

**Primary metric: care-pathway accuracy.** Did the system route the case where a
triage-trained reviewer would?

**The metric that actually drove the design: critical miss rate.** The share of
RED cases routed anywhere other than RED. Accuracy scores "sore throat sent to a
clinician instead of self-care" and "resolving stroke sent to self-care" as the
same single error. Only one of those hurts a person.

**On variance.** The models are not deterministic even at temperature 0. Three
main-evaluation runs produced agent accuracies of 85.7%, 78.6% and 78.6% — a
swing of ±1 case is noise. Rule changes landed between the first and second of
those runs, but they cannot explain the spread: the verification layer changed
**no outcome at all** in any main run, so the agent arm was scored on the model's
own pathway every time. The difference is model non-determinism.

The critical miss rate, by contrast, was **identical in every run** — 85.7% for
the baseline, 0.0% for the agent. The number that matters is the stable one.

---

## The changelog

| Stage | What I tried, and why | Evidence | Decision / learning |
|---|---|---|---|
| **Baseline** | One direct prompt, given the patient's opening message only. The brief's suggested simple baseline. | **45.2%** accuracy (3 runs: 50.0 / 42.9 / 42.9). **85.7% critical miss** — 6 of 7 RED cases missed, in every run. Info completeness 9.5%. | Established the floor. The failure is silent: fluent, confident, reasonable-sounding answers that route a subarachnoid haemorrhage to "see a clinician". |
| **Iteration 1** | Multi-turn conversation agent that asks adaptive follow-ups, plus a simulated patient that answers only what it is asked and volunteers nothing. | **81.0%** accuracy (78.6–85.7). **0% critical miss**, all 7 RED caught, every run. Completeness 9.5% → 53.4%. Cost $0.0019 → $0.0043/case; latency 2.1s → 18.8s; 1 → 8.9 turns. | **Kept.** This is the entire improvement. Everything downstream is refinement. |
| **Iteration 2** | Split extraction from triage into separate calls, so a confident narrative could not drag the routing decision along with it. | Not independently measured at the time — reasoned, not evidenced. Later measured in Iteration 4: contributes ~0 on this dataset. | **Kept**, but see Iteration 4. I should have measured it when I built it instead of assuming. |
| **Iteration 3** | Deterministic red-flag layer that takes `max(model pathway, rule pathway)` — able to escalate, structurally unable to de-escalate. | **Changed zero outcomes.** `agent` and `agent-no-verify` were byte-identical across all three runs. The rules fired and *agreed* 6 times and never once overrode the model. | **Kept, but unjustified at this point.** A layer that never fires is indistinguishable from a layer that does not work. Iteration 6 is where this got resolved. |
| **Iteration 4** | Attribution ablation: give the plain baseline prompt the full transcript the agent gathered (`baseline-informed`). | **Identical to the full agent** — 78.6% accuracy, 0% critical miss, same completeness. | **The most important result in this project.** All of the gain is information acquisition. None of it is pipeline structure. See "What I was wrong about" below. |
| **Iteration 5** | Rule coverage check with no model in the loop (`npm run rules:check`), asserting every RED case is independently reachable and no other case is pushed to RED. | Found **4 defects**: rules were matching the agent's own questions; `back-pain-cauda-equina` had no rule at all; `infant-fever` missed "six weeks old"; `sore-throat-airway` had no rule for drooling or muffled voice. RED coverage was 4/7. | **Fixed all four.** RED coverage 4/7 → **7/7**, with zero false escalations. Also a CI-ready check that costs nothing to run. |
| **Iteration 6** | Stress test (`--stress-triage`): re-run the agent with a deliberately reassurance-biased triage prompt, to create the condition the safety layer exists for. | **The layer made things worse.** Accuracy 71.4% → **57.1%** with verification on, and it still missed `infant-fever`. | **Kept the experiment, fixed the layer.** Three real bugs, below. This is the single most valuable thing I ran. |
| **Iteration 7** | Fixed what Iteration 6 exposed: clause-scoped negation with contractions; "five weeks" and other spelled-out durations; and a questioning-priority rule so the agent asks a child's age first. | Under the same miscalibrated model: **78.6% → 92.9%** accuracy, critical miss **14.3% → 0%**, over-triage **21.4% → 0%**. | **Kept.** The verification layer is now demonstrably worth its place — but only under a model that errs. |
| **Iteration 8** | Caught a regression *caused by* Iteration 7: the new questioning-priority rules silently outranked the "stop immediately if urgent" rule, so a patient describing a thunderclap headache got asked to rate their pain before being routed. | The evaluation could not see it — accuracy was unchanged. The end-to-end smoke test caught it, because it asserts the assessment locks on the red-flag turn. | **Fixed** by making the urgent-stop rule explicitly overriding. See "The regression the evaluation could not see". |
| **Final** | Everything above combined. | **85.7%** accuracy, **0% critical miss** (7/7 RED), 57.7% completeness, $0.0044 and 17.4s per case. Baseline on the same run: 42.9% / 85.7% critical miss. | Ship. Full table in [`README.md`](README.md); raw output in `eval/results/latest.md`. |

---

## What I was wrong about

I built a four-stage pipeline — conversation, extraction, triage, verification —
on the reasonable-sounding theory that decomposing the problem would make the
routing better. Iteration 4 tested that directly by handing the *plain baseline
prompt* the transcript the agent had gathered.

It scored identically to the full pipeline. 78.6% accuracy, 0% critical miss,
same completeness, at lower cost.

The honest reading: on this task, **the agentic value was entirely in acquiring
context, not in processing it.** Once the right facts were on the table, a single
unstructured prompt handled them as well as four coordinated stages. The
orchestration I was proudest of contributed nothing I could measure.

I kept the split anyway, for two reasons I can defend without claiming an
accuracy benefit: the structured summary is a real deliverable that the clinician
reads (a single blob of prose is not a handover document), and separating triage
from extraction is what gives the verification layer something well-typed to
check. But I am not going to claim it improved routing, because it did not.

## What the stress test exposed

Iteration 3 left me unable to say whether the verification layer worked, because
it had never once fired in anger. So I broke the thing it protects: a triage
prompt biased toward reassurance, standing in for a cheaper model, a prompt
regression, or a transcript crafted to sound calm.

The first stress run was ugly — the layer actively *hurt* accuracy, 71.4% down to
57.1%. Three genuine bugs, none of which the main evaluation could have surfaced:

1. **Negation was scoped to a six-word window.** The patient said *"No, it hasn't
   spread to my arms, jaw, or back."* — "jaw" sits seven words after the "No", so
   the cardiac rule fired on a symptom that had just been explicitly denied.
   Negation is now scoped to the whole clause, cancelled by a contrast word.
2. **Contractions were not negators.** `\bnot\b` does not match `hasn't`. Patients
   answer screening questions in contractions almost exclusively.
3. **The agent never asked the baby's age.** On `infant-fever` it asked about
   cough, rash, and medical records — never how old the child was, which is the
   entire decision. No rule can fire on a fact that was never gathered.

That third one is a *conversation* bug that only a *verification* stress test
revealed, which is the argument for having both.

After the fixes, the same stress run: **92.9% vs 78.6%**, critical miss **0% vs
14.3%**, over-triage **0% vs 21.4%**. The layer recovered the missed infant, and
the negation fix removed the false escalations it had been generating.

## The regression the evaluation could not see

Iteration 7's questioning-priority rules ("establish a child's age first", "ask
about onset before anything else") were added to the top of the conversation
prompt. They quietly outranked the rule that matters most: *stop asking questions
the moment something urgent has been described*.

The result was an agent that, told about a sudden worst-ever headache with
vomiting and neck stiffness, asked the patient to rate their pain out of ten
before routing them.

**The evaluation scored this as a perfect run.** Accuracy unchanged, critical
miss rate still zero — because the simulated patient simply answers the extra
question and the case still locks at RED within the turn budget. The metric has
no notion of "routed correctly, but a turn later than it should have been", and
for a subarachnoid haemorrhage that turn is the whole point.

What caught it was the end-to-end smoke test, which asserts that the assessment
locks *on* the red-flag turn rather than eventually. A scoring harness measures
the thing you told it to measure; an integration test notices when the system
stops behaving the way you assumed it did.

The fix makes the precedence explicit rather than positional — the urgent-stop
rule is now stated as overriding, ahead of the priority list, instead of relying
on where it happens to sit in the prompt.

## Experiments I removed

- **Optimistic-only rule matching (no negation guard).** Faster and simpler, and
  it caught every red flag. It also escalated roughly a fifth of the control
  cases, because a screening question that mentions a symptom looks exactly like
  a patient reporting one. A safety net that escalates everything is not a safety
  net; it is a way of training clinicians to ignore alerts.
- **A single combined "read the conversation and decide" call.** Cheaper and
  ~2s faster per case. Dropped not for accuracy — Iteration 4 suggests it would
  have scored the same — but because it produces no structured summary for the
  clinician and nothing typed for the rules to check.

---

## Main failure mode

**The agent does not know which unasked question is the decision.**

It reliably asks *good* questions. It does not reliably ask the *load-bearing*
one first. On `infant-fever` it worked patiently through a sensible general
history while the one fact that determined the entire pathway — the child's age —
went unasked until the conversation had already run long enough to lock.

I patched the specific instances I found (paediatric age, pain onset, direct
questions about self-harm). That is a patch, not a fix. The general problem
stands: the agent has no model of which missing fact has the highest expected
value, so it explores breadth-first through a reasonable checklist rather than
going straight for the fact that most changes the answer.

## Hot take

**A safety layer that has never fired is not a safety layer — it is an untested
hypothesis, and you cannot tell the two apart from your metrics.**

My verification layer looked perfect for three consecutive evaluation runs. Zero
escalations, zero regressions, zero cost. It was also, at that moment, carrying
four bugs serious enough that under a miscalibrated model it made triage
*measurably worse* than having no safety layer at all. Every one of those bugs
was invisible while the model it guards kept getting the answer right.

If you build a guard, you have to deliberately break the thing it guards, or you
have shipped a decoration and called it a control. The stress harness cost about
thirty lines and five cents a run, and it was worth more than every other
iteration in this changelog combined.

The second lesson, cheaper to state and harder to accept: **before adding
orchestration, test whether your problem is reasoning or information.** I assumed
a routing problem needed a better reasoning pipeline. It needed better questions.
One ablation, run at the end, would have told me that at the start.

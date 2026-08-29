# Reproduction guide

Written for someone starting from an empty machine. Every command is copy-pasteable.

---

## 1. What you need

| Requirement | Version used | Notes |
|---|---|---|
| Node.js | 22 or 25 (developed on v25.3.0) | `node -v` |
| npm | 11.x | ships with Node |
| MongoDB | Atlas free tier, or local `mongod` 6+ | Mongoose works against a standalone server — no replica set required |
| OpenAI API key | — | platform key from `platform.openai.com`. Needed only for real numbers; see §6 |

Approximate cost to reproduce the full evaluation: **well under US$1** (28 model-driven case runs; exact per-case cost is printed in the results table).

Approximate runtime: **3–6 minutes** for the full evaluation at the default concurrency of 3.

---

## 2. Install

```bash
git clone <this-repo> careloop && cd careloop && npm install
```

## 3. Configure

```bash
cp .env.example .env
```

Then edit `.env` and set three values:

| Variable | What to put |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/careloop` for a local server, or your Atlas `mongodb+srv://…` string |
| `JWT_SECRET` | any random 32+ character string — generate one with the command below |
| `OPENAI_API_KEY` | your platform API key. **Leave empty to run without one** (see §6) |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Seed the demo accounts

```bash
npm run seed
```

Creates five accounts, all with the password `CareLoop!2026`:

| Email | Role | State |
|---|---|---|
| `patient@careloop.test` | Patient | ready |
| `clinician@careloop.test` | Clinician | pre-verified |
| `pharmacy@careloop.test` | Pharmacy (Grace Pharmacy, delivers) | pre-verified |
| `pharmacy2@careloop.test` | Pharmacy (Unity Chemists, pickup only) | pre-verified |
| `admin@careloop.test` | Admin | ready |

The script is idempotent — re-running updates rather than duplicating.

## 5. Run the app

```bash
npm run dev
```

Open <http://localhost:3000>. To walk the whole loop:

1. Sign in as the **patient**, start a health chat, describe a symptom, answer the follow-up questions, and optionally upload a photo or a test result.
2. When the assessment locks, press **Request a clinician**.
3. Sign in as the **clinician** in a second browser profile — the case appears in the queue *without a refresh*. Accept it, read the summary and the safety-layer panel, message the patient, issue a prescription, complete the consultation.
4. Back as the **patient**, pick a pharmacy and send the prescription.
5. Sign in as the **pharmacy** to accept and move the order through to fulfilment. The patient's tracker updates live.
6. Sign in as the **admin** to see the pathway distribution, the escalation count, and the audit trail.

---

## 6. Running without an API key

The app and the evaluation both run with `OPENAI_API_KEY` empty. A deterministic
mock provider stands in: it does keyword lookups rather than reasoning, and it is
deliberately weak.

Every surface that can be reached under the mock says so — the eval prints a
warning banner and stamps `MOCK PROVIDER — these numbers are not real results` into
the report. **Do not report mock numbers as results.** They exist so that a
reviewer without a key can still verify that the pipeline, the verification layer,
the scoring and the trajectory capture all work.

---

## 7. Reproduce the evaluation

The headline claim of this project is a comparison between a single-prompt
baseline and the agent, on the same 14 synthetic cases.

```bash
npm run eval
```

Runs **both** arms over all cases and writes a timestamped folder to
`eval/results/`:

```
eval/results/<timestamp>/
  results.md            the comparison table (also copied to eval/results/latest.md)
  results.json          per-case machine-readable outcomes
  trajectories/         one JSON file per case per arm — every model call,
                        its input, its output, tokens, latency and retries
```

Individual arms, and a subset of cases:

```bash
npm run eval:baseline
npm run eval:agent
npm run eval -- --cases stroke-resolving,infant-fever,headache-thunderclap
npm run eval -- --concurrency 1        # slower, gentler on rate limits
```

### What the report contains

Four arms appear in the table, from two executions per case:

| Arm | What it is |
|---|---|
| `baseline` | One direct prompt, given only the patient's opening message. The brief's suggested simple baseline. |
| `baseline-informed` | The **same single prompt**, given the transcript the agent gathered. Separates the value of *asking the questions* from the value of the pipeline. |
| `agent-no-verify` | The full agent run, scored on the **model's** pathway before the deterministic verification layer. |
| `agent` | The same run, scored on the pathway the system actually acts on. |

`agent-no-verify` costs nothing extra — both pathways are recorded on every agent
run, so the ablation isolating the verification layer comes from the same
execution rather than a second one. `baseline-informed` adds one cheap call per case.

### Two supporting checks

```bash
npm run rules:check
```

Runs the deterministic red-flag layer against every case's fact sheet with **no
model involved**. Free, instant, deterministic. It asserts that every RED case is
independently reachable by the rules, and that no non-RED case is driven to RED
by rules alone. Exits non-zero on either failure, so it works in CI.

```bash
npm run eval -- --arm agent --stress-triage
```

Re-runs the agent with a deliberately miscalibrated, reassurance-biased triage
prompt — a stand-in for a cheaper model, a prompt regression, or an adversarial
transcript. Under a well-behaved model the verification layer changes nothing, so
this is the only way to measure what it is worth. Compare `agent-no-verify`
against `agent` in that run; the gap is what the layer recovers.

> In a stress run, only the agent's triage step is miscalibrated. `baseline` and
> `baseline-informed` still use the standard prompt, so they are not comparable
> to the agent arms there — the meaningful comparison is `agent-no-verify` vs `agent`.

### End-to-end check of the application

With the server running (`npm run dev`) in another terminal:

```bash
npm run smoke
```

Drives the entire care loop through the public HTTP API as four different users —
patient intake and assessment, clinician accept/prescribe/complete, pharmacy
fulfilment, and back to the patient — asserting the state machine at each step,
including that an illegal order transition is refused and that a second
prescription on one consultation is rejected. Costs a few cents, because the
intake really does call the model.

### The metric that matters

`Care-pathway accuracy` is the headline, but **`critical miss rate`** is the number
the design was optimised against: the share of RED cases routed anywhere other
than RED. Accuracy treats "sore throat sent to a clinician instead of self-care"
and "resolving stroke sent to self-care" as the same single error. They are not.

### Expected output

You should see the baseline lose most of the cases whose opening message reads as
benign (`headache-thunderclap`, `sore-throat-airway`, `stroke-resolving`,
`back-pain-cauda-equina`, `mental-health-crisis`), because it answers the opener and
never asks a second question. You should see the agent's over-triage rate be
non-zero — it is a screening system and that is the intended trade.

Exact figures from our run are in [`CHANGELOG.md`](CHANGELOG.md) alongside the
iteration that produced each change.

> Because the models are non-deterministic (temperature 0 reduces but does not
> eliminate variance), your absolute numbers may differ by a case or two. The
> direction and size of the gap should reproduce.

---

## 8. Deploying to Render

The repository includes [`render.yaml`](render.yaml).

1. Push to GitHub, then in Render choose **New → Blueprint** and point it at the repo.
2. Set `MONGODB_URI` and `OPENAI_API_KEY` in the dashboard (both are `sync: false`, so they are never committed). `JWT_SECRET` is generated by Render.
3. In MongoDB Atlas, allow network access from `0.0.0.0/0` — Render's free tier has no static outbound IP to allowlist.
4. After the first deploy, seed the demo accounts from the Render shell:

```bash
npm run seed
```

Socket.IO and Next share one HTTP listener (`server.mjs`), so this is a single
web service with no sticky-session configuration.

---

## 9. Project layout

```
src/agents/         the agent layer — provider seam, prompts, orchestration, rules
  provider.ts       OpenAI + deterministic mock behind one interface
  schemas.ts        zod contracts; nothing leaves src/agents unvalidated
  steps.ts          conversation, extraction, triage, vision, baseline
  verify.ts         the deterministic red-flag layer (escalate-only)
  pipeline.ts       orchestration
  call.ts           validated model calls, one retry, trajectory recording
eval/               cases, scoring, runner
src/lib/            db, models, auth, realtime, conversation state machine
src/app/api/        REST endpoints
src/components/     UI
scripts/seed.ts     demo accounts
server.mjs          Next + Socket.IO on one listener
```

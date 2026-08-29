# Evaluation run index

Every run kept in this directory, and which claim in
[`../../CHANGELOG.md`](../../CHANGELOG.md) it supports. Accuracy is shown as
`accuracy / critical-miss-rate`.

All runs use the same 14 cases in [`../cases.json`](../cases.json). Each run
folder holds `results.md` (the readable table), `results.json` (raw per-case
outcomes), and `trajectories/` (one file per case per arm, showing every model
call, its inputs, and what the verification layer did).

| Run | Provider | What it is | Headline | Supports |
|---|---|---|---|---|
| `2026-08-29T14-58-54-798Z` | **mock** | Harness shakedown before the API key was wired in. Triage here is keyword matching, not reasoning. | agent 66.7% / 0.0 | **Nothing.** Kept only to show the mock path runs. Not evidence for any claim. |
| `2026-08-29T15-25-34-533Z` | openai | Main run 1. | baseline 50.0 / 85.7 · agent 85.7 / 0.0 | Baseline floor; Iteration 1; variance |
| `2026-08-29T15-31-04-466Z` | openai | Main run 2, after the first round of rule fixes. | baseline 42.9 / 85.7 · agent 78.6 / 0.0 | Variance; Iteration 5 |
| `2026-08-29T15-33-45-678Z` | openai | Main run 3, same configuration as run 2. | baseline 42.9 / 85.7 · agent 78.6 / 0.0 | Variance (the ±1-case spread) |
| `2026-08-29T15-45-12-269Z` | openai | First run including the `baseline-informed` attribution arm. | baseline 42.9 / 85.7 · **baseline-informed 78.6 / 0.0** · agent 78.6 / 0.0 | **Iteration 4** — the result showing the gain is information acquisition, not pipeline structure |
| `2026-08-29T15-48-17-066Z` | openai | **Stress run, before the rule fixes.** Miscalibrated triage prompt. | agent-no-verify 71.4 / 14.3 · **agent 57.1 / 14.3** | **Iteration 6** — the verification layer making things worse |
| `2026-08-29T15-51-47-511Z` | openai | **Stress run, after the rule fixes.** Same miscalibrated prompt. | agent-no-verify 78.6 / 14.3 · **agent 92.9 / 0.0** | **Iteration 7** — what the layer is worth once it is correct |
| `2026-08-29T15-53-52-508Z` | openai | **Final run.** All fixes in. Also copied to [`latest.md`](latest.md). | baseline 42.9 / 85.7 · **agent 85.7 / 0.0** | The headline table in [`../../README.md`](../../README.md) |

## Reading a stress run

In a stress run only the agent's triage step is miscalibrated. `baseline` and
`baseline-informed` still use the standard prompt, so they are **not** comparable
to the agent arms there. The meaningful comparison is `agent-no-verify` against
`agent` — the gap is what the deterministic layer recovered.

Stress runs are labelled in the `**Note:**` line at the top of their
`results.md`.

## Regenerating

```bash
npm run eval                                  # main run, all four arms
npm run eval -- --arm agent --stress-triage   # stress run
npm run rules:check                           # deterministic layer only, free
```

Expect ±1 case of movement between runs on accuracy — the models are not
deterministic even at temperature 0. The critical miss rate was identical across
every non-stress run.

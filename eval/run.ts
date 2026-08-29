import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Trajectory, callJson } from "../src/agents/call";
import { getProvider, MODELS, providerIsMock } from "../src/agents/provider";
import { conversationTurn, baseline } from "../src/agents/steps";
import { runAssessment } from "../src/agents/pipeline";
import { Pathway } from "../src/lib/models";
import { z } from "zod";
import {
  CaseOutcome,
  scoreCase,
  summarise,
  renderMarkdown,
  ArmSummary,
} from "./score";

/**
 * Evaluation harness.
 *
 *   npm run eval                 both arms, all cases
 *   npm run eval:baseline        baseline only
 *   npm run eval:agent           agent only
 *   npm run eval -- --cases stroke-resolving,infant-fever
 *
 * Writes a timestamped folder under eval/results/ containing the summary table,
 * the raw per-case JSON, and one trajectory file per case per arm.
 */

interface EvalCase {
  id: string;
  category: string;
  opening: string;
  facts: string[];
  expected: { pathway: Pathway; mustCapture: string[] };
  note?: string;
}

const MAX_TURNS = 10;

// ------------------------------------------------------- patient simulator

const simSchema = z.object({ reply: z.string().min(1) });

/**
 * The simulated patient.
 *
 * It answers only from the case fact sheet and is explicitly told to volunteer
 * nothing. That constraint is what makes the comparison meaningful: information
 * has to be *asked for* to be obtained, which is the entire bottleneck under
 * test (seed §26). Both arms face the identical fact sheet; the baseline simply
 * never asks a second question.
 */
async function patientReply(
  c: EvalCase,
  history: { role: "PATIENT" | "AI"; content: string }[],
  trajectory: Trajectory,
): Promise<string> {
  const { data } = await callJson({
    call: {
      step: "patient-sim",
      model: MODELS.fast,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: [
            "You are role-playing a patient using a health service. Reply as the patient would, in one or two short sentences.",
            "",
            "These are the only facts true about you:",
            ...c.facts.map((f) => `- ${f}`),
            "",
            "Rules:",
            "- Answer only what you were actually asked.",
            "- Never volunteer a fact you were not asked about. This is important.",
            "- If asked something not covered by the facts above, say you are not sure or answer no.",
            "- Speak like an ordinary person, not a doctor. Do not use clinical terms unless the facts use them.",
            "- Never mention that you are role-playing or that you have a list of facts.",
            "",
            'Return JSON: { "reply": string }',
          ].join("\n"),
        },
        {
          role: "user",
          content:
            `You opened the conversation by saying: "${c.opening}"\n\n` +
            history
              .map((m) => `${m.role === "AI" ? "Service" : "You"}: ${m.content}`)
              .join("\n") +
            `\n\nReply to the service's latest message.`,
        },
      ],
    },
    schema: simSchema,
    trajectory,
    fallback: () => ({ reply: "I'm not sure." }),
  });

  return data.reply;
}

// -------------------------------------------------------------- the arms

async function runBaselineArm(c: EvalCase): Promise<{
  outcome: Omit<CaseOutcome, "arm">;
  trajectory: Trajectory;
}> {
  const trajectory = new Trajectory();
  const started = Date.now();
  let error: string | undefined;
  let result;

  try {
    result = await baseline(c.opening, trajectory);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    result = {
      carePathway: "YELLOW",
      chiefComplaint: "",
      symptoms: [],
      redFlags: [],
      duration: "",
      severity: "",
      allergies: [],
      medications: [],
      summary: "",
      urgency: "",
      reasoning: "",
    };
  }

  const totals = trajectory.totals;
  const outcome = scoreCase({
    caseId: c.id,
    category: c.category,
    arm: "baseline",
    expected: c.expected,
    predicted: result.carePathway as Pathway,
    structuredText: JSON.stringify(result),
    latencyMs: Date.now() - started,
    costUsd: totals.costUsd,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    modelCalls: totals.modelCalls,
    turns: 1,
    error,
  });

  return { outcome, trajectory };
}

async function runAgentArm(c: EvalCase, stressTriage = false): Promise<{
  outcome: Omit<CaseOutcome, "arm">;
  /** Same run, scored on the pre-verification pathway. Free ablation. */
  ablation: Omit<CaseOutcome, "arm">;
  /** The single prompt, but handed the transcript the agent gathered. */
  informed: Omit<CaseOutcome, "arm">;
  trajectory: Trajectory;
}> {
  const trajectory = new Trajectory();
  const started = Date.now();
  const history: { role: "PATIENT" | "AI"; content: string }[] = [
    { role: "PATIENT", content: c.opening },
  ];

  let error: string | undefined;
  let turns = 1;

  try {
    // --- conversation phase: the agent interviews the simulated patient
    for (let i = 0; i < MAX_TURNS; i++) {
      const turn = await conversationTurn({ history }, trajectory);
      history.push({ role: "AI", content: turn.reply });

      if (turn.readyToAssess) {
        trajectory.note(
          "assessment-lock",
          `Agent locked the assessment after ${turns} patient turn(s).`,
        );
        break;
      }

      const reply = await patientReply(c, history, trajectory);
      history.push({ role: "PATIENT", content: reply });
      turns++;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const transcript = history
    .map((m) => `${m.role === "PATIENT" ? "Patient" : "Service"}: ${m.content}`)
    .join("\n");

  let assessment;
  try {
    assessment = await runAssessment({ transcript, trajectory, miscalibratedTriage: stressTriage });
  } catch (err) {
    error = error ?? (err instanceof Error ? err.message : String(err));
    throw err;
  }

  const totals = trajectory.totals;
  const structuredText = JSON.stringify({
    ...assessment.extraction,
    transcript,
  });

  const common = {
    caseId: c.id,
    category: c.category,
    expected: c.expected,
    structuredText,
    latencyMs: Date.now() - started,
    costUsd: totals.costUsd,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    modelCalls: totals.modelCalls,
    turns,
    error,
  };

  /**
   * Third arm: the baseline prompt, given everything the agent managed to
   * gather. If this scores like the baseline, the gain came from the pipeline;
   * if it scores like the agent, the gain came from asking the questions. It is
   * the only way to attribute the improvement honestly.
   */
  const informedTrajectory = new Trajectory();
  let informedPathway: Pathway = "YELLOW";
  try {
    const result = await baseline(transcript, informedTrajectory);
    informedPathway = result.carePathway as Pathway;
  } catch {
    // leave the cautious default
  }

  return {
    outcome: scoreCase({ ...common, arm: "agent", predicted: assessment.finalPathway }),
    ablation: scoreCase({ ...common, arm: "agent-no-verify", predicted: assessment.aiPathway }),
    informed: scoreCase({
      ...common,
      arm: "baseline-informed",
      predicted: informedPathway,
      costUsd: informedTrajectory.totals.costUsd,
      modelCalls: informedTrajectory.totals.modelCalls,
    }),
    trajectory,
  };
}

// ------------------------------------------------------------------ main

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  return {
    arm: (get("--arm") ?? "both") as "baseline" | "agent" | "both",
    cases: get("--cases")?.split(",").map((s) => s.trim()).filter(Boolean),
    concurrency: Number(get("--concurrency") ?? 3),
    stressTriage: argv.includes("--stress-triage"),
  };
}

/** Bounded parallelism — enough to keep the run short, gentle on rate limits. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs();
  const raw = JSON.parse(readFileSync(join(process.cwd(), "eval/cases.json"), "utf8"));
  let cases: EvalCase[] = raw.cases;

  if (args.cases?.length) {
    cases = cases.filter((c) => args.cases!.includes(c.id));
    if (!cases.length) throw new Error(`No cases matched: ${args.cases.join(", ")}`);
  }

  const isMock = providerIsMock();
  if (isMock) {
    console.warn(
      "\n  ! OPENAI_API_KEY is not set. Running on the deterministic mock provider.\n" +
        "    These numbers measure nothing and must not be reported as results.\n",
    );
  }

  const startedAt = new Date().toISOString();
  const outDir = join(process.cwd(), "eval/results", startedAt.replace(/[:.]/g, "-"));
  mkdirSync(join(outDir, "trajectories"), { recursive: true });

  console.log(`Running ${cases.length} case(s) · arm=${args.arm} · provider=${getProvider().name}`);

  const outcomes: CaseOutcome[] = [];

  if (args.arm === "baseline" || args.arm === "both") {
    process.stdout.write("baseline: ");
    const results = await pool(cases, args.concurrency, async (c) => {
      const { outcome, trajectory } = await runBaselineArm(c);
      writeFileSync(
        join(outDir, "trajectories", `${c.id}.baseline.json`),
        JSON.stringify({ case: c.id, arm: "baseline", ...trajectory.toJSON() }, null, 2),
      );
      process.stdout.write(outcome.correct ? "." : outcome.criticalMiss ? "X" : "x");
      return { ...outcome, arm: "baseline" } as CaseOutcome;
    });
    outcomes.push(...results);
    process.stdout.write("\n");
  }

  if (args.arm === "agent" || args.arm === "both") {
    process.stdout.write("agent:    ");
    const results = await pool(cases, args.concurrency, async (c) => {
      const { outcome, ablation, informed, trajectory } = await runAgentArm(c, args.stressTriage);
      writeFileSync(
        join(outDir, "trajectories", `${c.id}.agent.json`),
        JSON.stringify({ case: c.id, arm: "agent", ...trajectory.toJSON() }, null, 2),
      );
      process.stdout.write(outcome.correct ? "." : outcome.criticalMiss ? "X" : "x");
      return [
        { ...outcome, arm: "agent" } as CaseOutcome,
        { ...ablation, arm: "agent-no-verify" } as CaseOutcome,
        { ...informed, arm: "baseline-informed" } as CaseOutcome,
      ];
    });
    outcomes.push(...results.flat());
    process.stdout.write("\n");
  }

  const armOrder = ["baseline", "baseline-informed", "agent-no-verify", "agent"].filter((a) =>
    outcomes.some((o) => o.arm === a),
  );
  const summaries: ArmSummary[] = armOrder.map((arm) =>
    summarise(
      arm,
      outcomes.filter((o) => o.arm === arm),
    ),
  );

  const md = renderMarkdown(summaries, outcomes, {
    provider: getProvider().name,
    models: `fast=${MODELS.fast}, strong=${MODELS.strong}`,
    startedAt,
    note: isMock
      ? "MOCK PROVIDER — these numbers are not real results."
      : args.stressTriage
        ? "STRESS RUN — the triage step uses a deliberately miscalibrated, reassurance-biased prompt. The gap between `agent-no-verify` and `agent` is what the deterministic verification layer recovers when the model under-triages."
        : "`baseline-informed` is the single baseline prompt given the transcript the agent gathered — it separates the value of asking questions from the value of the pipeline. `agent-no-verify` is the agent scored before the verification layer.",
  });

  writeFileSync(join(outDir, "results.md"), md);
  writeFileSync(
    join(outDir, "results.json"),
    JSON.stringify({ startedAt, provider: getProvider().name, summaries, outcomes }, null, 2),
  );
  writeFileSync(join(process.cwd(), "eval/results/latest.md"), md);

  console.log("\n" + md);
  console.log(`\nWritten to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

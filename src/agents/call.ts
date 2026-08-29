import { z } from "zod";
import { LlmCall, LlmProvider, getProvider } from "./provider";
import { extractJsonObject } from "./schemas";

/**
 * Trajectory recording.
 *
 * Every model call in a run appends a step here. The eval harness writes these
 * out per case (hackathon deliverable #4) and the chat UI streams them live so
 * a reviewer can see what the agent did and why, not just what it concluded.
 */

export interface TrajectoryStep {
  step: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  attempts: number;
  input: string;
  output: string;
  note?: string;
}

export class Trajectory {
  readonly steps: TrajectoryStep[] = [];
  readonly startedAt = Date.now();

  /** `onStep` lets the chat UI stream the agent's work as it happens. */
  constructor(private onStep?: (step: TrajectoryStep) => void) {}

  add(step: TrajectoryStep) {
    this.steps.push(step);
    try {
      this.onStep?.(step);
    } catch {
      // A subscriber blowing up must never fail the agent run.
    }
  }

  /** Non-model decisions worth seeing in the trace, e.g. a rule escalation. */
  note(step: string, note: string, output = "") {
    this.add({
      step,
      model: "deterministic",
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      attempts: 0,
      input: "",
      output,
      note,
    });
  }

  get totals() {
    return this.steps.reduce(
      (acc, s) => ({
        tokensIn: acc.tokensIn + s.tokensIn,
        tokensOut: acc.tokensOut + s.tokensOut,
        costUsd: acc.costUsd + s.costUsd,
        latencyMs: acc.latencyMs + s.latencyMs,
        modelCalls: acc.modelCalls + (s.model === "deterministic" ? 0 : 1),
      }),
      { tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0, modelCalls: 0 },
    );
  }

  toJSON() {
    return { steps: this.steps, totals: this.totals };
  }
}

function preview(call: LlmCall): string {
  const last = call.messages[call.messages.length - 1];
  const text =
    typeof last?.content === "string"
      ? last.content
      : (last?.content ?? [])
          .map((p) => (p.type === "text" ? p.text : `[image ${p.mimeType}]`))
          .join(" ");
  return text.slice(0, 1500);
}

export interface CallJsonOptions<T> {
  call: LlmCall;
  schema: z.ZodType<T>;
  trajectory?: Trajectory;
  provider?: LlmProvider;
  /** Used when both attempts fail. Without one, the error propagates. */
  fallback?: () => T;
}

/**
 * One model call, parsed and validated.
 *
 * On a parse or schema failure the error text is fed back to the model for a
 * single retry. That retry is cheaper than a failed patient turn, but a second
 * failure falls through to `fallback` rather than looping — an agent that
 * retries indefinitely against a confused model just burns the user's time.
 */
export async function callJson<T>(opts: CallJsonOptions<T>): Promise<{
  data: T;
  repaired: boolean;
}> {
  const provider = opts.provider ?? getProvider();
  const call: LlmCall = { ...opts.call, json: true };

  let attempts = 0;
  let lastError = "";
  let messages = call.messages;

  while (attempts < 2) {
    attempts++;
    const res = await provider.complete({ ...call, messages });

    try {
      const parsed = opts.schema.parse(extractJsonObject(res.text));
      opts.trajectory?.add({
        step: opts.call.step,
        model: res.model,
        latencyMs: res.latencyMs,
        tokensIn: res.usage.tokensIn,
        tokensOut: res.usage.tokensOut,
        costUsd: res.usage.costUsd,
        attempts,
        input: preview({ ...call, messages }),
        output: res.text.slice(0, 2000),
        note: attempts > 1 ? `recovered after schema failure: ${lastError}` : undefined,
      });
      return { data: parsed, repaired: attempts > 1 };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      opts.trajectory?.add({
        step: `${opts.call.step}:invalid`,
        model: res.model,
        latencyMs: res.latencyMs,
        tokensIn: res.usage.tokensIn,
        tokensOut: res.usage.tokensOut,
        costUsd: res.usage.costUsd,
        attempts,
        input: preview({ ...call, messages }),
        output: res.text.slice(0, 2000),
        note: `schema rejected: ${lastError}`,
      });

      messages = [
        ...call.messages,
        { role: "assistant", content: res.text.slice(0, 2000) },
        {
          role: "user",
          content:
            `That response did not match the required schema: ${lastError}\n` +
            `Return ONLY a valid JSON object matching the schema. No prose, no code fences.`,
        },
      ];
    }
  }

  if (opts.fallback) {
    opts.trajectory?.note(
      `${opts.call.step}:fallback`,
      `two schema failures — fell back to the safe default. Last error: ${lastError}`,
    );
    return { data: opts.fallback(), repaired: true };
  }

  throw new Error(`${opts.call.step}: model output failed schema twice — ${lastError}`);
}

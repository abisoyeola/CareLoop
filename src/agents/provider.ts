import OpenAI from "openai";

/**
 * Thin provider seam between the agents and whatever model is behind them.
 *
 * Everything above this file talks in terms of `LlmProvider`, so the eval
 * harness can swap in a deterministic mock and still exercise the real
 * orchestration, verification and scoring code.
 */

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; base64: string };

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface LlmCall {
  messages: LlmMessage[];
  /** Logical step name — used for telemetry and trajectory logs. */
  step: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface LlmUsage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmProvider {
  readonly name: string;
  complete(call: LlmCall): Promise<LlmResponse>;
}

// ------------------------------------------------------------- pricing

/**
 * USD per 1M tokens. Used to report cost-per-case in the eval rather than
 * guessing at it. Update alongside the provider's public price list.
 */
export const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
};

export function priceOf(model: string, tokensIn: number, tokensOut: number): number {
  const key = Object.keys(PRICING).find((m) => model.startsWith(m));
  if (!key) return 0;
  const p = PRICING[key];
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

export const MODELS = {
  /** Cheap, high-volume: conversation turns and extraction. */
  fast: process.env.OPENAI_MODEL_FAST || "gpt-4o-mini",
  /** Reasoning-sensitive: triage decisions and image reading. */
  strong: process.env.OPENAI_MODEL_STRONG || "gpt-4o",
};

// -------------------------------------------------------------- OpenAI

function toOpenAiContent(content: string | ContentPart[]) {
  if (typeof content === "string") return content;
  return content.map((part) =>
    part.type === "text"
      ? { type: "text" as const, text: part.text }
      : {
          type: "image_url" as const,
          image_url: { url: `data:${part.mimeType};base64,${part.base64}` },
        },
  );
}

export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(call: LlmCall): Promise<LlmResponse> {
    const model = call.model || MODELS.fast;
    const started = Date.now();

    const res = await this.client.chat.completions.create({
      model,
      temperature: call.temperature ?? 0.2,
      max_tokens: call.maxTokens ?? 1200,
      response_format: call.json ? { type: "json_object" } : undefined,
      messages: call.messages.map((m) => ({
        role: m.role,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: toOpenAiContent(m.content) as any,
      })),
    });

    const tokensIn = res.usage?.prompt_tokens ?? 0;
    const tokensOut = res.usage?.completion_tokens ?? 0;

    return {
      text: res.choices[0]?.message?.content ?? "",
      model,
      latencyMs: Date.now() - started,
      usage: { tokensIn, tokensOut, costUsd: priceOf(model, tokensIn, tokensOut) },
    };
  }
}

// ---------------------------------------------------------------- mock

/**
 * Deterministic stand-in so the app boots, the chat runs and the eval executes
 * without an API key. It is intentionally weak: it does keyword lookups, not
 * reasoning. Numbers produced under the mock are labelled as such and are not
 * reported as results.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";

  async complete(call: LlmCall): Promise<LlmResponse> {
    const text = this.respond(call);
    return {
      text,
      model: "mock",
      latencyMs: 5,
      usage: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
    };
  }

  private transcript(call: LlmCall): string {
    return call.messages
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : m.content.map((p) => (p.type === "text" ? p.text : "[image]")).join(" "),
      )
      .join("\n")
      .toLowerCase();
  }

  private respond(call: LlmCall): string {
    const text = this.transcript(call);

    if (call.step === "conversation") {
      return JSON.stringify({
        reply:
          "Thanks for telling me that. How long have you been experiencing this, " +
          "and has anything made it better or worse?",
        options: ["Since today", "A few days", "Over a week"],
        readyToAssess: text.length > 400,
        missingFields: ["duration", "severity"],
      });
    }

    if (call.step === "vision") {
      return JSON.stringify({
        kind: "unknown",
        findings: ["Mock provider active — no image analysis performed."],
        values: [],
        redFlags: [],
        legible: false,
        caveat: "Mock provider: image was not read.",
      });
    }

    if (call.step === "extraction") {
      return JSON.stringify({
        chiefComplaint: "Reported symptoms (mock extraction)",
        duration: "unknown",
        severity: "unknown",
        symptoms: [],
        redFlags: [],
        allergies: [],
        medications: [],
        history: [],
        summary: "Mock provider active — structured summary not generated.",
      });
    }

    // triage + baseline
    const urgent = /chest pain|can't breathe|cannot breathe|unconscious|stroke|slurred/.test(text);
    return JSON.stringify({
      carePathway: urgent ? "RED" : "YELLOW",
      urgency: urgent ? "urgent" : "non_urgent",
      reasoning: "Mock provider: keyword match only, not clinical reasoning.",
      requiresHumanReview: true,
    });
  }
}

// -------------------------------------------------------------- factory

let cached: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (cached) return cached;
  const key = process.env.OPENAI_API_KEY;
  cached = key ? new OpenAiProvider(key) : new MockProvider();
  return cached;
}

export function providerIsMock(): boolean {
  return getProvider().name === "mock";
}

/** Test seam — lets the eval harness force a provider. */
export function setProvider(p: LlmProvider | null) {
  cached = p;
}

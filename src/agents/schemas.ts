import { z } from "zod";
import { PATHWAYS } from "@/lib/models";

/**
 * The contract between the model and the application (seed §16).
 * Nothing crosses out of `src/agents` without passing one of these.
 */

export const pathwaySchema = z.enum(
  PATHWAYS as unknown as [string, ...string[]],
);

/** One turn of the Conversation Agent. */
export const conversationTurnSchema = z.object({
  reply: z.string().min(1),
  /** Quick-reply chips, as in seed §8. Empty for open questions. */
  options: z.array(z.string()).max(6).default([]),
  /** The agent's own judgement that it has enough to lock an assessment. */
  readyToAssess: z.boolean().default(false),
  missingFields: z.array(z.string()).default([]),
});
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

/** Conversation transcript → structured patient summary. */
export const extractionSchema = z.object({
  chiefComplaint: z.string().min(1),
  duration: z.string().default("unknown"),
  severity: z.string().default("unknown"),
  symptoms: z.array(z.string()).default([]),
  redFlags: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  history: z.array(z.string()).default([]),
  summary: z.string().default(""),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** Structured summary → preliminary care pathway. */
export const triageSchema = z.object({
  carePathway: pathwaySchema,
  urgency: z.string().default("non_urgent"),
  reasoning: z.string().default(""),
  requiresHumanReview: z.boolean().default(true),
});
export type Triage = z.infer<typeof triageSchema>;

/** What the vision step is allowed to return about an upload. */
export const visionSchema = z.object({
  kind: z.string().default("unknown"),
  findings: z.array(z.string()).default([]),
  values: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        flag: z.string().optional(),
      }),
    )
    .default([]),
  redFlags: z.array(z.string()).default([]),
  legible: z.boolean().default(true),
  caveat: z.string().optional(),
});
export type VisionExtraction = z.infer<typeof visionSchema>;

/** The baseline's single-shot output. Same shape, so scoring is identical. */
export const baselineSchema = z.object({
  carePathway: pathwaySchema,
  urgency: z.string().default("non_urgent"),
  reasoning: z.string().default(""),
  chiefComplaint: z.string().default(""),
  symptoms: z.array(z.string()).default([]),
  redFlags: z.array(z.string()).default([]),
  duration: z.string().default("unknown"),
  severity: z.string().default("unknown"),
  allergies: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

/**
 * Models return JSON with prose wrapped around it more often than they should.
 * Pull the first balanced object out rather than failing the whole turn.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("no JSON object in model output");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1));
    }
  }

  throw new Error("unbalanced JSON object in model output");
}

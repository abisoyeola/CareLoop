import { Trajectory } from "./call";
import { extract, triage } from "./steps";
import { verify } from "./verify";
import { Extraction, Triage } from "./schemas";
import { Pathway, IVerification } from "@/lib/models";

/**
 * Orchestration: transcript -> structured summary -> preliminary pathway ->
 * deterministic verification -> routed result.
 *
 * The split into separate extraction and triage calls is deliberate. Asking one
 * call to both read the conversation and decide the pathway lets a confident
 * narrative pull the decision along with it; separating them means triage only
 * ever sees the facts that survived extraction.
 */

export interface AssessmentResult {
  extraction: Extraction;
  /** Raw model pathway, before the verification layer. Kept for the ablation. */
  aiPathway: Pathway;
  aiReasoning: string;
  /** What the system actually routes on. */
  finalPathway: Pathway;
  urgency: string;
  requiresHumanReview: boolean;
  verification: IVerification;
  trajectory: Trajectory;
}

export interface AssessmentInput {
  transcript: string;
  uploadContext?: string[];
  trajectory?: Trajectory;
  /** Evaluation only — see the note on the miscalibrated prompt in steps.ts. */
  miscalibratedTriage?: boolean;
}

export async function runAssessment(input: AssessmentInput): Promise<AssessmentResult> {
  const trajectory = input.trajectory ?? new Trajectory();
  const uploadContext = input.uploadContext ?? [];

  const extraction = await extract(input.transcript, uploadContext, trajectory);
  const triaged: Triage = await triage(
    extraction,
    trajectory,
    input.miscalibratedTriage ?? false,
  );

  const verified = verify({
    transcript: [input.transcript, ...uploadContext].join("\n"),
    extraction,
    triage: triaged,
  });

  if (verified.verification.escalated) {
    trajectory.note(
      "verification:escalate",
      `Rules overrode the model: ${triaged.carePathway} -> ${verified.pathway}. ` +
        `${verified.verification.escalationReason}`,
      verified.pathway,
    );
  } else if (verified.verification.rulesFired.length) {
    trajectory.note(
      "verification:confirm",
      `${verified.verification.rulesFired.length} rule(s) fired and agreed with the model at ${verified.pathway}.`,
      verified.pathway,
    );
  } else {
    trajectory.note("verification:clear", "No red-flag rule fired.", verified.pathway);
  }

  if (verified.verification.missingFields.length) {
    trajectory.note(
      "verification:incomplete",
      `Missing required fields: ${verified.verification.missingFields.join(", ")}. ` +
        `Assessment is flagged incomplete for the clinician.`,
    );
  }

  return {
    extraction,
    aiPathway: triaged.carePathway as Pathway,
    aiReasoning: triaged.reasoning,
    finalPathway: verified.pathway,
    urgency: verified.urgency,
    requiresHumanReview: verified.requiresHumanReview,
    verification: verified.verification,
    trajectory,
  };
}

/** Patient-facing copy for each pathway. Never states a diagnosis. */
export const PATHWAY_COPY: Record<
  Pathway,
  { title: string; tone: string; action: string; cta: string }
> = {
  RED: {
    title: "Urgent medical attention",
    tone: "urgent",
    action:
      "Based on what you have described, you should be seen urgently. Please contact " +
      "emergency services or go to the nearest emergency department now. Do not wait " +
      "for a response here.",
    cta: "Get urgent help",
  },
  YELLOW: {
    title: "Clinician consultation",
    tone: "attention",
    action:
      "What you have described should be reviewed by a clinician. We can connect you " +
      "with a registered clinician who will read this summary before speaking with you.",
    cta: "Request a clinician",
  },
  MEDICATION_REVIEW: {
    title: "Medication review",
    tone: "attention",
    action:
      "A clinician needs to review this before any medication decision can be made. " +
      "CareLoop cannot recommend or authorise medication on its own.",
    cta: "Request a clinician",
  },
  GREEN: {
    title: "Self-care and monitoring",
    tone: "calm",
    action:
      "Based on what you have described, monitoring at home is reasonable for now. " +
      "If anything changes or worsens, come back and start a new conversation — or " +
      "request a clinician at any time.",
    cta: "Request a clinician anyway",
  },
};

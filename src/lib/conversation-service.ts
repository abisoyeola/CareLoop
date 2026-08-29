import { Types } from "mongoose";
import {
  Conversation,
  Message,
  Attachment,
  Assessment,
  IMessage,
  Pathway,
} from "./models";
import { emitToUser } from "./realtime";
import { audit } from "./api";
import { Trajectory } from "@/agents/call";
import { conversationTurn } from "@/agents/steps";
import { runAssessment, PATHWAY_COPY } from "@/agents/pipeline";

/**
 * Everything that happens between "patient typed something" and "the assessment
 * is locked". Route handlers stay thin; this holds the state machine.
 */

export const OPENING_MESSAGE =
  "Hello — I'm the CareLoop health assistant. I'll ask you a few questions to " +
  "understand what's going on, then point you to the right kind of care.\n\n" +
  "I'm not a doctor and I can't diagnose you. A registered clinician reviews " +
  "anything that needs one.\n\n" +
  "If this is an emergency, please contact emergency services now.\n\n" +
  "What's been going on?";

export function serialiseMessage(m: IMessage & { attachments?: unknown[] }) {
  return {
    id: String(m._id),
    role: m.senderRole,
    content: m.content,
    kind: m.kind,
    meta: m.meta ?? null,
    attachmentIds: (m.attachmentIds ?? []).map(String),
    createdAt: m.createdAt,
  };
}

/** Findings read off uploads, so the agent never re-asks what it can already see. */
export async function uploadContextFor(conversationId: string): Promise<string[]> {
  const files = await Attachment.find({ conversationId })
    .select("filename kind extraction")
    .lean();

  const context: string[] = [];
  for (const f of files) {
    const e = f.extraction;
    if (!e) continue;
    if (!e.legible) {
      context.push(`${f.filename}: uploaded but could not be read automatically.`);
      continue;
    }
    for (const finding of e.findings ?? []) context.push(`${f.filename}: ${finding}`);
    for (const v of e.values ?? []) {
      context.push(`${f.filename}: ${v.label} = ${v.value}${v.flag ? ` (${v.flag})` : ""}`);
    }
    for (const r of e.redFlags ?? []) context.push(`${f.filename}: FLAGGED — ${r}`);
  }
  return context;
}

export async function transcriptFor(conversationId: string): Promise<string> {
  const messages = await Message.find({
    conversationId,
    kind: { $in: ["TEXT", "ATTACHMENT", "OPTIONS"] },
  })
    .sort({ createdAt: 1 })
    .lean();

  return messages
    .filter((m) => m.senderRole === "PATIENT" || m.senderRole === "AI")
    .map((m) => `${m.senderRole === "PATIENT" ? "Patient" : "Service"}: ${m.content}`)
    .join("\n");
}

async function historyFor(conversationId: string) {
  const messages = await Message.find({
    conversationId,
    senderRole: { $in: ["PATIENT", "AI"] },
    kind: { $in: ["TEXT", "ATTACHMENT", "OPTIONS"] },
  })
    .sort({ createdAt: 1 })
    .lean();

  return messages.map((m) => ({
    role: m.senderRole === "PATIENT" ? ("PATIENT" as const) : ("AI" as const),
    content: m.content,
  }));
}

/**
 * One agent turn.
 *
 * Returns the messages it created so the caller can emit them. The assessment
 * lock (seed §10) happens here too: when the conversation agent says it has
 * enough — or spots something urgent and stops early — the pipeline runs and
 * the conversation moves to ASSESSMENT_COMPLETE.
 */
export async function advanceConversation(opts: {
  conversationId: string;
  patientUserId: string;
  patientContext?: string;
}) {
  const { conversationId, patientUserId } = opts;

  // Stream the agent's steps to the patient's own socket room as they happen.
  const trajectory = new Trajectory((step) =>
    emitToUser(patientUserId, "agent-step", {
      conversationId,
      step: step.step,
      note: step.note,
      model: step.model,
      latencyMs: step.latencyMs,
    }),
  );

  const [history, uploadContext] = await Promise.all([
    historyFor(conversationId),
    uploadContextFor(conversationId),
  ]);

  const turn = await conversationTurn(
    { history, uploadContext, patientContext: opts.patientContext },
    trajectory,
  );

  const aiMessage = await Message.create({
    conversationId: new Types.ObjectId(conversationId),
    senderRole: "AI",
    content: turn.reply,
    kind: turn.options.length ? "OPTIONS" : "TEXT",
    meta: turn.options.length ? { options: turn.options } : undefined,
  });

  const created: IMessage[] = [aiMessage.toObject()];

  if (!turn.readyToAssess) {
    await Conversation.findByIdAndUpdate(conversationId, { state: "ASSESSING" });
    return { created, assessment: null, trajectory };
  }

  // ---- assessment lock ----
  const transcript = await transcriptFor(conversationId);
  const result = await runAssessment({ transcript, uploadContext, trajectory });

  const assessment = await Assessment.findOneAndUpdate(
    { conversationId: new Types.ObjectId(conversationId) },
    {
      conversationId: new Types.ObjectId(conversationId),
      patientUserId: new Types.ObjectId(patientUserId),
      chiefComplaint: result.extraction.chiefComplaint,
      duration: result.extraction.duration,
      severity: result.extraction.severity,
      symptoms: result.extraction.symptoms,
      redFlags: result.extraction.redFlags,
      allergies: result.extraction.allergies,
      medications: result.extraction.medications,
      history: result.extraction.history,
      summary: result.extraction.summary,
      aiPathway: result.aiPathway,
      finalPathway: result.finalPathway,
      urgency: result.urgency,
      verification: result.verification,
      requiresHumanReview: result.requiresHumanReview,
      lockedAt: new Date(),
      telemetry: {
        model: trajectory.steps.find((s) => s.step === "triage")?.model,
        tokensIn: trajectory.totals.tokensIn,
        tokensOut: trajectory.totals.tokensOut,
        latencyMs: trajectory.totals.latencyMs,
        costUsd: trajectory.totals.costUsd,
      },
    },
    { upsert: true, new: true },
  );

  const copy = PATHWAY_COPY[result.finalPathway as Pathway];

  const cardMessage = await Message.create({
    conversationId: new Types.ObjectId(conversationId),
    senderRole: "SYSTEM",
    kind: "ASSESSMENT_CARD",
    content: copy.action,
    meta: {
      assessmentId: String(assessment._id),
      pathway: result.finalPathway,
      title: copy.title,
      tone: copy.tone,
      cta: copy.cta,
      escalated: result.verification.escalated,
      escalatedFrom: result.verification.escalatedFrom,
      escalationReason: result.verification.escalationReason,
      rulesFired: result.verification.rulesFired,
      chiefComplaint: result.extraction.chiefComplaint,
    },
  });

  created.push(cardMessage.toObject());

  await Conversation.findByIdAndUpdate(conversationId, {
    state: "ASSESSMENT_COMPLETE",
    title: result.extraction.chiefComplaint.slice(0, 60) || "Health chat",
  });

  await audit({
    actorUserId: patientUserId,
    actorRole: "PATIENT",
    action: "assessment.locked",
    resource: "Assessment",
    resourceId: String(assessment._id),
    newState: result.finalPathway,
    meta: {
      aiPathway: result.aiPathway,
      escalated: result.verification.escalated,
      escalationReason: result.verification.escalationReason,
      rulesFired: result.verification.rulesFired.map((r) => r.id),
    },
  });

  return { created, assessment, trajectory };
}

import { Types } from "mongoose";
import { route, ok, fail, audit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { Conversation, Assessment, Consultation, Message } from "@/lib/models";
import { emitToRole, emitToUser } from "@/lib/realtime";
import { serialiseMessage } from "@/lib/conversation-service";

/**
 * The handoff to a human (seed §11).
 *
 * Available on every pathway, including GREEN — a patient who wants a clinician
 * gets one regardless of what the assessment concluded. The AI's job is to
 * route, not to gatekeep.
 */
export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole("PATIENT");
    const { id } = await ctx.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) return fail("Conversation not found", 404);
    if (String(conversation.patientUserId) !== session.userId) {
      return fail("Not your conversation", 403);
    }

    const assessment = await Assessment.findOne({ conversationId: id });
    if (!assessment) {
      return fail("Finish the health chat before requesting a clinician", 409);
    }

    const existing = await Consultation.findOne({ assessmentId: assessment._id });
    if (existing) {
      return ok({ consultation: { id: String(existing._id), state: existing.state } });
    }

    const consultation = await Consultation.create({
      assessmentId: assessment._id,
      conversationId: conversation._id,
      patientUserId: new Types.ObjectId(session.userId),
      state: "QUEUED",
    });

    await Conversation.findByIdAndUpdate(id, { state: "ROUTED" });

    const systemMessage = await Message.create({
      conversationId: conversation._id,
      senderRole: "SYSTEM",
      kind: "SYSTEM_EVENT",
      content:
        "Your request has been added to the clinician queue. A registered clinician " +
        "will review your summary and message you here.",
      meta: { consultationId: String(consultation._id), event: "consultation.queued" },
    });

    await audit({
      actorUserId: session.userId,
      actorRole: "PATIENT",
      action: "consultation.requested",
      resource: "Consultation",
      resourceId: String(consultation._id),
      newState: "QUEUED",
      meta: { pathway: assessment.finalPathway },
    });

    emitToUser(session.userId, "message", {
      conversationId: id,
      message: serialiseMessage(systemMessage.toObject()),
    });

    // Every verified clinician sees the queue grow immediately.
    emitToRole("CLINICIAN", "queue-update", {
      consultationId: String(consultation._id),
      pathway: assessment.finalPathway,
      chiefComplaint: assessment.chiefComplaint,
      createdAt: consultation.createdAt,
    });

    return ok({ consultation: { id: String(consultation._id), state: consultation.state } }, 201);
  },
);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

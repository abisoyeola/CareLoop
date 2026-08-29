import { route, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import {
  Conversation,
  Message,
  Assessment,
  Attachment,
  Consultation,
} from "@/lib/models";
import { serialiseMessage } from "@/lib/conversation-service";

export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole("PATIENT");
    const { id } = await ctx.params;

    const conversation = await Conversation.findById(id).lean();
    if (!conversation) return fail("Conversation not found", 404);
    if (String(conversation.patientUserId) !== session.userId) {
      return fail("Not your conversation", 403);
    }

    const [messages, assessment, attachments, consultation] = await Promise.all([
      Message.find({ conversationId: id }).sort({ createdAt: 1 }).lean(),
      Assessment.findOne({ conversationId: id }).lean(),
      // Never select `data` here — that is what the attachment route is for.
      Attachment.find({ conversationId: id })
        .select("filename kind mimeType size extraction createdAt")
        .lean(),
      Consultation.findOne({ conversationId: id }).lean(),
    ]);

    return ok({
      conversation: {
        id: String(conversation._id),
        title: conversation.title,
        state: conversation.state,
      },
      messages: messages.map((m) => serialiseMessage(m)),
      attachments: attachments.map((a) => ({
        id: String(a._id),
        filename: a.filename,
        kind: a.kind,
        mimeType: a.mimeType,
        size: a.size,
        extraction: a.extraction ?? null,
      })),
      assessment: assessment
        ? {
            id: String(assessment._id),
            chiefComplaint: assessment.chiefComplaint,
            duration: assessment.duration,
            severity: assessment.severity,
            symptoms: assessment.symptoms,
            redFlags: assessment.redFlags,
            allergies: assessment.allergies,
            medications: assessment.medications,
            history: assessment.history,
            summary: assessment.summary,
            aiPathway: assessment.aiPathway,
            finalPathway: assessment.finalPathway,
            verification: assessment.verification,
            lockedAt: assessment.lockedAt,
          }
        : null,
      consultation: consultation
        ? { id: String(consultation._id), state: consultation.state }
        : null,
    });
  },
);

export const dynamic = "force-dynamic";

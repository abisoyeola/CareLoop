import { Types } from "mongoose";
import { route, ok, fail, audit, requireVerifiedClinician } from "@/lib/api";
import { Consultation, Message, Assessment } from "@/lib/models";
import { emitToRole, emitToUser } from "@/lib/realtime";
import { serialiseMessage } from "@/lib/conversation-service";

export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireVerifiedClinician();
    const { id } = await ctx.params;

    /**
     * Claim is a single conditional update rather than read-then-write. Two
     * clinicians hitting Accept on the same RED case at the same moment is the
     * expected case at a busy queue, not an edge case.
     */
    const consultation = await Consultation.findOneAndUpdate(
      { _id: id, state: "QUEUED" },
      {
        state: "ACCEPTED",
        clinicianUserId: new Types.ObjectId(session.userId),
        acceptedAt: new Date(),
      },
      { new: true },
    );

    if (!consultation) {
      const existing = await Consultation.findById(id).lean();
      if (!existing) return fail("Consultation not found", 404);
      if (String(existing.clinicianUserId ?? "") === session.userId) {
        return ok({ consultation: { id, state: existing.state }, alreadyMine: true });
      }
      return fail("Another clinician has already taken this consultation", 409);
    }

    const assessment = await Assessment.findById(consultation.assessmentId)
      .select("chiefComplaint finalPathway")
      .lean();

    const notice = await Message.create({
      consultationId: consultation._id,
      senderRole: "SYSTEM",
      kind: "SYSTEM_EVENT",
      content: `${session.name} has picked up your consultation and is reviewing your summary.`,
      meta: { event: "consultation.accepted" },
    });

    await audit({
      actorUserId: session.userId,
      actorRole: "CLINICIAN",
      action: "consultation.accepted",
      resource: "Consultation",
      resourceId: id,
      prevState: "QUEUED",
      newState: "ACCEPTED",
    });

    emitToUser(String(consultation.patientUserId), "message", {
      consultationId: id,
      message: serialiseMessage(notice.toObject()),
    });
    emitToUser(String(consultation.patientUserId), "consultation-update", {
      consultationId: id,
      state: "ACCEPTED",
      clinicianName: session.name,
    });
    emitToRole("CLINICIAN", "queue-update", {
      consultationId: id,
      state: "ACCEPTED",
      takenBy: session.name,
      pathway: assessment?.finalPathway,
    });

    return ok({ consultation: { id, state: "ACCEPTED" } });
  },
);

export const dynamic = "force-dynamic";

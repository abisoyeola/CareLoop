import { z } from "zod";
import { route, ok, fail, audit, requireVerifiedClinician } from "@/lib/api";
import { Consultation, Assessment, Message, PATHWAYS } from "@/lib/models";
import { emitToRole, emitToUser } from "@/lib/realtime";
import { serialiseMessage } from "@/lib/conversation-service";

const schema = z.object({
  clinicianPathway: z.enum(PATHWAYS as unknown as [string, ...string[]]),
  clinicianNotes: z.string().min(1, "Record what you concluded").max(4000),
});

/**
 * Completing the consultation is where the human either confirms or overrules
 * the AI's preliminary pathway (seed §6.2, §11). Both are recorded — the
 * disagreements are the interesting data, since they are the signal for whether
 * the triage layer is drifting.
 */
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireVerifiedClinician();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const consultation = await Consultation.findById(id);
    if (!consultation) return fail("Consultation not found", 404);
    if (String(consultation.clinicianUserId ?? "") !== session.userId) {
      return fail("Only the clinician handling this consultation can complete it", 403);
    }
    if (consultation.state === "COMPLETED") {
      return fail("Already completed", 409);
    }

    const assessment = await Assessment.findById(consultation.assessmentId)
      .select("finalPathway aiPathway")
      .lean();

    const prevState = consultation.state;
    consultation.state = "COMPLETED";
    consultation.clinicianPathway = body.clinicianPathway as typeof consultation.clinicianPathway;
    consultation.clinicianNotes = body.clinicianNotes;
    consultation.completedAt = new Date();
    await consultation.save();

    const agreed = assessment?.finalPathway === body.clinicianPathway;

    const notice = await Message.create({
      consultationId: consultation._id,
      senderRole: "SYSTEM",
      kind: "SYSTEM_EVENT",
      content: `${session.name} has completed this consultation.\n\n${body.clinicianNotes}`,
      meta: { event: "consultation.completed", clinicianPathway: body.clinicianPathway },
    });

    await audit({
      actorUserId: session.userId,
      actorRole: "CLINICIAN",
      action: agreed ? "consultation.completed" : "consultation.completed.pathway-revised",
      resource: "Consultation",
      resourceId: id,
      prevState,
      newState: "COMPLETED",
      meta: {
        aiPathway: assessment?.aiPathway ?? null,
        systemPathway: assessment?.finalPathway ?? null,
        clinicianPathway: body.clinicianPathway,
        agreed,
      },
    });

    const payload = { consultationId: id, message: serialiseMessage(notice.toObject()) };
    emitToUser(String(consultation.patientUserId), "message", payload);
    emitToUser(String(consultation.patientUserId), "consultation-update", {
      consultationId: id,
      state: "COMPLETED",
    });
    emitToRole("CLINICIAN", "queue-update", { consultationId: id, state: "COMPLETED" });

    return ok({
      consultation: { id, state: "COMPLETED", clinicianPathway: body.clinicianPathway },
      agreedWithSystem: agreed,
    });
  },
);

export const dynamic = "force-dynamic";

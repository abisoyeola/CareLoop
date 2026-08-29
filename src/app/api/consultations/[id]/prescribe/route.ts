import { z } from "zod";
import { Types } from "mongoose";
import { route, ok, fail, audit, requireVerifiedClinician } from "@/lib/api";
import { Consultation, Prescription, Message, Assessment } from "@/lib/models";
import { emitToUser } from "@/lib/realtime";
import { serialiseMessage } from "@/lib/conversation-service";

const schema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        dose: z.string().min(1),
        frequency: z.string().min(1),
        duration: z.string().min(1),
        notes: z.string().optional(),
      }),
    )
    .min(1, "A prescription needs at least one item"),
  notes: z.string().max(2000).optional(),
});

/**
 * The consequential action, and the one place the AI is structurally excluded.
 *
 * A prescription exists only because a verified, assigned human clinician typed
 * it and submitted it. Nothing in the agent pipeline can create one, propose one
 * into this endpoint, or pre-fill it. Seed §12 and §21, and hackathon ground
 * rules 04 and 05.
 */
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireVerifiedClinician();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const consultation = await Consultation.findById(id);
    if (!consultation) return fail("Consultation not found", 404);
    if (String(consultation.clinicianUserId ?? "") !== session.userId) {
      return fail("Only the clinician handling this consultation can prescribe", 403);
    }
    if (consultation.state === "QUEUED") {
      return fail("Accept the consultation first", 409);
    }
    if (await Prescription.findOne({ consultationId: consultation._id })) {
      return fail("A prescription has already been issued for this consultation", 409);
    }

    const prescription = await Prescription.create({
      consultationId: consultation._id,
      clinicianUserId: new Types.ObjectId(session.userId),
      patientUserId: consultation.patientUserId,
      items: body.items,
      notes: body.notes,
    });

    const assessment = await Assessment.findById(consultation.assessmentId)
      .select("allergies")
      .lean();

    const notice = await Message.create({
      consultationId: consultation._id,
      senderRole: "SYSTEM",
      kind: "SYSTEM_EVENT",
      content:
        `${session.name} has issued a prescription. Choose a verified pharmacy to have it fulfilled.`,
      meta: {
        event: "prescription.issued",
        prescriptionId: String(prescription._id),
        items: body.items,
      },
    });

    await audit({
      actorUserId: session.userId,
      actorRole: "CLINICIAN",
      action: "prescription.created",
      resource: "Prescription",
      resourceId: String(prescription._id),
      meta: {
        consultationId: id,
        items: body.items.map((i) => i.name),
        // Recorded so a later allergy conflict is auditable against what the
        // patient had reported at the time of prescribing.
        reportedAllergies: assessment?.allergies ?? [],
      },
    });

    const payload = {
      consultationId: id,
      message: serialiseMessage(notice.toObject()),
    };
    emitToUser(String(consultation.patientUserId), "message", payload);
    emitToUser(String(consultation.patientUserId), "consultation-update", {
      consultationId: id,
      prescriptionId: String(prescription._id),
    });

    return ok(
      {
        prescription: {
          id: String(prescription._id),
          items: prescription.items,
          notes: prescription.notes ?? null,
          issuedAt: prescription.issuedAt,
        },
      },
      201,
    );
  },
);

export const dynamic = "force-dynamic";

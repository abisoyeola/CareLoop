import { z } from "zod";
import { Types } from "mongoose";
import { route, ok, fail } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { Consultation, Message } from "@/lib/models";
import { emitToUser } from "@/lib/realtime";
import { serialiseMessage } from "@/lib/conversation-service";

const schema = z.object({ content: z.string().min(1).max(4000) });

/** Patient <-> clinician thread. No AI participates here. */
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { id } = await ctx.params;
    const { content } = schema.parse(await req.json());

    const consultation = await Consultation.findById(id);
    if (!consultation) return fail("Consultation not found", 404);

    const isPatient = String(consultation.patientUserId) === session.userId;
    const isClinician = String(consultation.clinicianUserId ?? "") === session.userId;
    if (!isPatient && !isClinician) return fail("Not allowed", 403);

    if (consultation.state === "QUEUED") {
      return fail("A clinician has not picked this up yet", 409);
    }
    if (consultation.state === "COMPLETED") {
      return fail("This consultation has been completed", 409);
    }

    if (isClinician && consultation.state === "ACCEPTED") {
      consultation.state = "IN_PROGRESS";
      await consultation.save();
      emitToUser(String(consultation.patientUserId), "consultation-update", {
        consultationId: id,
        state: "IN_PROGRESS",
      });
    }

    const message = await Message.create({
      consultationId: new Types.ObjectId(id),
      senderRole: isPatient ? "PATIENT" : "CLINICIAN",
      senderUserId: new Types.ObjectId(session.userId),
      content,
      kind: "TEXT",
    });

    const payload = { consultationId: id, message: serialiseMessage(message.toObject()) };
    emitToUser(String(consultation.patientUserId), "message", payload);
    if (consultation.clinicianUserId) {
      emitToUser(String(consultation.clinicianUserId), "message", payload);
    }

    return ok({ message: payload.message }, 201);
  },
);

export const dynamic = "force-dynamic";

import { route, ok, fail } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import {
  Consultation,
  Assessment,
  Message,
  Attachment,
  User,
  Prescription,
  PharmacyOrder,
} from "@/lib/models";
import { serialiseMessage } from "@/lib/conversation-service";

/**
 * The clinician handoff packet (seed §11) — everything needed to pick the case
 * up cold: the structured summary, what the verification layer did, the full AI
 * conversation, the uploads, and the consultation thread itself.
 */
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { id } = await ctx.params;

    const consultation = await Consultation.findById(id).lean();
    if (!consultation) return fail("Consultation not found", 404);

    const isPatient = String(consultation.patientUserId) === session.userId;
    const isAssigned = String(consultation.clinicianUserId ?? "") === session.userId;
    // A verified clinician may read a queued case in order to decide whether to
    // take it; once claimed, only the assigned clinician can.
    const canView =
      isPatient ||
      isAssigned ||
      (session.role === "CLINICIAN" && consultation.state === "QUEUED");

    if (!canView) return fail("Not allowed", 403);

    const [assessment, aiMessages, thread, attachments, patient, clinician, prescription] =
      await Promise.all([
        Assessment.findById(consultation.assessmentId).lean(),
        Message.find({ conversationId: consultation.conversationId })
          .sort({ createdAt: 1 })
          .lean(),
        Message.find({ consultationId: id }).sort({ createdAt: 1 }).lean(),
        Attachment.find({ conversationId: consultation.conversationId })
          .select("filename kind mimeType size extraction")
          .lean(),
        User.findById(consultation.patientUserId).select("name email patient").lean(),
        consultation.clinicianUserId
          ? User.findById(consultation.clinicianUserId).select("name clinician").lean()
          : null,
        Prescription.findOne({ consultationId: id }).lean(),
      ]);

    const order = prescription
      ? await PharmacyOrder.findOne({ prescriptionId: prescription._id }).lean()
      : null;

    return ok({
      consultation: {
        id: String(consultation._id),
        state: consultation.state,
        clinicianPathway: consultation.clinicianPathway ?? null,
        clinicianNotes: consultation.clinicianNotes ?? null,
        createdAt: consultation.createdAt,
        acceptedAt: consultation.acceptedAt ?? null,
        completedAt: consultation.completedAt ?? null,
        mine: isAssigned,
      },
      patient: patient
        ? {
            name: patient.name,
            email: session.role === "CLINICIAN" ? patient.email : undefined,
            knownAllergies: patient.patient?.knownAllergies ?? null,
            currentMeds: patient.patient?.currentMeds ?? null,
            dateOfBirth: patient.patient?.dateOfBirth ?? null,
          }
        : null,
      clinician: clinician
        ? { name: clinician.name, specialty: clinician.clinician?.specialty ?? null }
        : null,
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
            urgency: assessment.urgency,
            verification: assessment.verification,
            lockedAt: assessment.lockedAt,
            telemetry: assessment.telemetry ?? null,
          }
        : null,
      aiConversation: aiMessages.map((m) => serialiseMessage(m)),
      messages: thread.map((m) => serialiseMessage(m)),
      attachments: attachments.map((a) => ({
        id: String(a._id),
        filename: a.filename,
        kind: a.kind,
        mimeType: a.mimeType,
        size: a.size,
        extraction: a.extraction ?? null,
      })),
      prescription: prescription
        ? {
            id: String(prescription._id),
            items: prescription.items,
            notes: prescription.notes ?? null,
            issuedAt: prescription.issuedAt,
            order: order
              ? { id: String(order._id), status: order.status, method: order.fulfillmentMethod }
              : null,
          }
        : null,
    });
  },
);

export const dynamic = "force-dynamic";

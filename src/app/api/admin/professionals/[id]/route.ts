import { route, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { User, Consultation, Prescription, AuditLog, Assessment } from "@/lib/models";
import mongoose from "mongoose";

/**
 * Deep profile for a single clinician or pharmacy.
 * Returns their info, performance metrics, and recent audit/activity log.
 */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireRole("ADMIN");
  const { id } = await params;

  if (!mongoose.isValidObjectId(id)) return fail("Invalid ID", 400);

  const user = await User.findById(id)
    .select("name email role clinician pharmacy createdAt")
    .lean();

  if (!user) return fail("Professional not found", 404);
  if (user.role !== "CLINICIAN" && user.role !== "PHARMACY") {
    return fail("Not a clinician or pharmacy account", 422);
  }

  const userId = user._id;

  // Parallel fetch of all activity data
  const [consultations, prescriptions, auditLogs] = await Promise.all([
    Consultation.find({ clinicianUserId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Prescription.find({ clinicianUserId: userId })
      .sort({ issuedAt: -1 })
      .limit(50)
      .lean(),
    AuditLog.find({ actorUserId: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
  ]);

  // Enrich consultations with assessment pathway
  const assessmentIds = consultations.map((c) => c.assessmentId);
  const assessments = await Assessment.find({ _id: { $in: assessmentIds } })
    .select("finalPathway chiefComplaint")
    .lean();
  const asmtBy = new Map(assessments.map((a) => [String(a._id), a]));

  // Enrich consultations with patient names
  const patientIds = consultations.map((c) => c.patientUserId);
  const patients = await User.find({ _id: { $in: patientIds } })
    .select("name")
    .lean();
  const patBy = new Map(patients.map((p) => [String(p._id), p.name]));

  // Performance summary
  const totalConsultations = consultations.length;
  const completedConsultations = consultations.filter((c) => c.state === "COMPLETED").length;
  const avgResponseMs =
    consultations
      .filter((c) => c.acceptedAt && c.createdAt)
      .reduce((sum, c) => sum + (new Date(c.acceptedAt!).getTime() - new Date(c.createdAt).getTime()), 0) /
    (consultations.filter((c) => c.acceptedAt).length || 1);

  return ok({
    profile: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      specialty: user.clinician?.specialty ?? null,
      licenseNo: user.clinician?.licenseNo ?? null,
      verified:
        user.role === "CLINICIAN"
          ? Boolean(user.clinician?.verified)
          : Boolean(user.pharmacy?.verified),
      pharmacyName: user.pharmacy?.name ?? null,
      address: user.pharmacy?.address ?? null,
      phone: user.pharmacy?.phone ?? null,
      deliveryAvailable: user.pharmacy?.deliveryAvailable ?? null,
      openingHours: user.pharmacy?.openingHours ?? null,
      joinedAt: user.createdAt,
    },
    metrics: {
      totalConsultations,
      completedConsultations,
      completionRate: totalConsultations ? completedConsultations / totalConsultations : 0,
      prescriptionsIssued: prescriptions.length,
      avgResponseMinutes: Math.round(avgResponseMs / 60000),
    },
    recentConsultations: consultations.slice(0, 20).map((c) => ({
      id: String(c._id),
      state: c.state,
      pathway: asmtBy.get(String(c.assessmentId))?.finalPathway ?? "YELLOW",
      chiefComplaint: asmtBy.get(String(c.assessmentId))?.chiefComplaint ?? "",
      patientName: patBy.get(String(c.patientUserId)) ?? "Patient",
      createdAt: c.createdAt,
      acceptedAt: c.acceptedAt ?? null,
      completedAt: c.completedAt ?? null,
    })),
    activityLog: auditLogs.map((a) => ({
      id: String(a._id),
      action: a.action,
      resource: a.resource,
      resourceId: a.resourceId ?? null,
      prevState: a.prevState ?? null,
      newState: a.newState ?? null,
      meta: a.meta ?? null,
      createdAt: a.createdAt,
    })),
  });
});

export const dynamic = "force-dynamic";

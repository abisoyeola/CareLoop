import { route, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import {
  User,
  Assessment,
  Consultation,
  PharmacyOrder,
  AuditLog,
} from "@/lib/models";

/**
 * Admin view (seed §6.4, §20): who is waiting for verification, and the audit
 * trail. The pathway distribution is here too because a sudden shift in it is
 * the earliest visible sign that the triage layer has drifted.
 */
export const GET = route(async () => {
  await requireRole("ADMIN");

  const [
    pendingClinicians,
    pendingPharmacies,
    userCounts,
    pathwayCounts,
    escalations,
    consultationStates,
    orderStates,
    recentAudit,
  ] = await Promise.all([
    User.find({ role: "CLINICIAN", "clinician.verified": false })
      .select("name email clinician createdAt")
      .lean(),
    User.find({ role: "PHARMACY", "pharmacy.verified": false })
      .select("name email pharmacy createdAt")
      .lean(),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    Assessment.aggregate([{ $group: { _id: "$finalPathway", count: { $sum: 1 } } }]),
    Assessment.countDocuments({ "verification.escalated": true }),
    Consultation.aggregate([{ $group: { _id: "$state", count: { $sum: 1 } } }]),
    PharmacyOrder.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    AuditLog.find().sort({ createdAt: -1 }).limit(60).lean(),
  ]);

  const totalAssessments = pathwayCounts.reduce((a, p) => a + p.count, 0);
  const actorIds = [...new Set(recentAudit.map((a) => String(a.actorUserId)).filter(Boolean))];
  const actors = await User.find({ _id: { $in: actorIds } })
    .select("name")
    .lean();
  const actorBy = new Map(actors.map((a) => [String(a._id), a.name]));

  const toMap = (rows: { _id: string; count: number }[]) =>
    Object.fromEntries(rows.map((r) => [r._id, r.count]));

  return ok({
    pending: {
      clinicians: pendingClinicians.map((c) => ({
        id: String(c._id),
        name: c.name,
        email: c.email,
        specialty: c.clinician?.specialty ?? "",
        licenseNo: c.clinician?.licenseNo ?? "",
        createdAt: c.createdAt,
      })),
      pharmacies: pendingPharmacies.map((p) => ({
        id: String(p._id),
        name: p.name,
        email: p.email,
        pharmacyName: p.pharmacy?.name ?? "",
        address: p.pharmacy?.address ?? "",
        createdAt: p.createdAt,
      })),
    },
    stats: {
      users: toMap(userCounts),
      pathways: toMap(pathwayCounts),
      totalAssessments,
      escalations,
      escalationRate: totalAssessments ? escalations / totalAssessments : 0,
      consultations: toMap(consultationStates),
      orders: toMap(orderStates),
    },
    audit: recentAudit.map((a) => ({
      id: String(a._id),
      action: a.action,
      resource: a.resource,
      resourceId: a.resourceId ?? null,
      actor: a.actorUserId ? (actorBy.get(String(a.actorUserId)) ?? "Unknown") : "System",
      actorRole: a.actorRole,
      prevState: a.prevState ?? null,
      newState: a.newState ?? null,
      meta: a.meta ?? null,
      createdAt: a.createdAt,
    })),
  });
});

export const dynamic = "force-dynamic";

import { route, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { User, Consultation, Prescription, AuditLog } from "@/lib/models";

/**
 * Returns every CLINICIAN and PHARMACY user, enriched with activity metrics,
 * for the admin Professionals panel.
 *
 * Bug fix: original query omitted `role` from `.select()`, so every `u.role`
 * check in mapProf returned `undefined !== "CLINICIAN"` → always fell through
 * to the pharmacy branch, always reading a missing field → always `false`.
 * Fixed by selecting `role` explicitly AND using per-array mappers.
 */
export const GET = route(async () => {
  await requireRole("ADMIN");

  const [clinicians, pharmacies] = await Promise.all([
    User.find({ role: "CLINICIAN" })
      .select("name email role clinician createdAt")   // ← role now included
      .sort({ createdAt: -1 })
      .lean(),
    User.find({ role: "PHARMACY" })
      .select("name email role pharmacy createdAt")    // ← role now included
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const allIds = [...clinicians, ...pharmacies].map((u) => u._id);

  // Consultation counts per clinician
  const consultationStats = await Consultation.aggregate([
    { $match: { clinicianUserId: { $in: allIds } } },
    {
      $group: {
        _id: "$clinicianUserId",
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$state", "COMPLETED"] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ["$state", "IN_PROGRESS"] }, 1, 0] } },
        lastAt: { $max: "$acceptedAt" },
      },
    },
  ]);

  // Prescription counts per clinician
  const prescriptionStats = await Prescription.aggregate([
    { $match: { clinicianUserId: { $in: allIds } } },
    { $group: { _id: "$clinicianUserId", total: { $sum: 1 } } },
  ]);

  // Last audit action per professional
  const lastAudit = await AuditLog.aggregate([
    { $match: { actorUserId: { $in: allIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$actorUserId", action: { $first: "$action" }, at: { $first: "$createdAt" } } },
  ]);

  const consultBy = new Map(consultationStats.map((s) => [String(s._id), s]));
  const rxBy     = new Map(prescriptionStats.map((s) => [String(s._id), s.total]));
  const auditBy  = new Map(lastAudit.map((a) => [String(a._id), a]));

  const base = (u: { _id: unknown; name: string; email: string; role: string; createdAt: Date }) => {
    const id = String(u._id);
    const cs = consultBy.get(id);
    const lastAct = auditBy.get(id);
    return {
      id,
      name: u.name,
      email: u.email,
      role: u.role,
      consultations: { total: cs?.total ?? 0, completed: cs?.completed ?? 0, inProgress: cs?.inProgress ?? 0 },
      prescriptions: rxBy.get(id) ?? 0,
      lastActivityAt: lastAct?.at ?? null,
      lastAction: lastAct?.action ?? null,
      joinedAt: u.createdAt,
    };
  };

  return ok({
    clinicians: clinicians.map((u) => ({
      ...base(u),
      // Clinician-specific — directly access .clinician; no role check needed
      specialty: u.clinician?.specialty ?? null,
      licenseNo: u.clinician?.licenseNo ?? null,
      verified: Boolean(u.clinician?.verified),       // ← now reads correct field
      pharmacyName: null,
      address: null,
      phone: null,
      deliveryAvailable: null,
      openingHours: null,
    })),
    pharmacies: pharmacies.map((u) => ({
      ...base(u),
      specialty: null,
      licenseNo: null,
      // Pharmacy-specific — directly access .pharmacy; no role check needed
      verified: Boolean(u.pharmacy?.verified),        // ← now reads correct field
      pharmacyName: u.pharmacy?.name ?? null,
      address: u.pharmacy?.address ?? null,
      phone: u.pharmacy?.phone ?? null,
      deliveryAvailable: u.pharmacy?.deliveryAvailable ?? null,
      openingHours: u.pharmacy?.openingHours ?? null,
    })),
  });
});

export const dynamic = "force-dynamic";

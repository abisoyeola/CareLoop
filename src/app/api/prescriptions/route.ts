import { route, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { Prescription, PharmacyOrder, User } from "@/lib/models";

/** The patient's prescriptions, with fulfilment state where one exists. */
export const GET = route(async () => {
  const session = await requireRole("PATIENT");

  const prescriptions = await Prescription.find({ patientUserId: session.userId })
    .sort({ issuedAt: -1 })
    .lean();

  const [orders, clinicians] = await Promise.all([
    PharmacyOrder.find({ prescriptionId: { $in: prescriptions.map((p) => p._id) } }).lean(),
    User.find({ _id: { $in: prescriptions.map((p) => p.clinicianUserId) } })
      .select("name clinician")
      .lean(),
  ]);

  const pharmacies = await User.find({ _id: { $in: orders.map((o) => o.pharmacyUserId) } })
    .select("name pharmacy")
    .lean();

  const orderBy = new Map(orders.map((o) => [String(o.prescriptionId), o]));
  const clinicianBy = new Map(clinicians.map((c) => [String(c._id), c]));
  const pharmacyBy = new Map(pharmacies.map((p) => [String(p._id), p]));

  return ok({
    prescriptions: prescriptions.map((p) => {
      const order = orderBy.get(String(p._id));
      const clinician = clinicianBy.get(String(p.clinicianUserId));
      const pharmacy = order ? pharmacyBy.get(String(order.pharmacyUserId)) : null;

      return {
        id: String(p._id),
        consultationId: String(p.consultationId),
        items: p.items,
        notes: p.notes ?? null,
        issuedAt: p.issuedAt,
        prescribedBy: clinician?.name ?? "Clinician",
        specialty: clinician?.clinician?.specialty ?? null,
        order: order
          ? {
              id: String(order._id),
              status: order.status,
              method: order.fulfillmentMethod,
              rejectReason: order.rejectReason ?? null,
              pharmacyName: pharmacy?.pharmacy?.name ?? pharmacy?.name ?? "Pharmacy",
              pharmacyAddress: pharmacy?.pharmacy?.address ?? "",
              updatedAt: order.updatedAt,
            }
          : null,
      };
    }),
  });
});

export const dynamic = "force-dynamic";

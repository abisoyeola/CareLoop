import { route, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { PharmacyOrder, Prescription, User } from "@/lib/models";

/** Pharmacy fulfilment queue, or the patient's own orders. */
export const GET = route(async () => {
  const session = await requireSession();

  const filter =
    session.role === "PHARMACY"
      ? { pharmacyUserId: session.userId }
      : { patientUserId: session.userId };

  const orders = await PharmacyOrder.find(filter).sort({ createdAt: -1 }).limit(100).lean();

  const [prescriptions, people] = await Promise.all([
    Prescription.find({ _id: { $in: orders.map((o) => o.prescriptionId) } })
      .select("items notes issuedAt clinicianUserId")
      .lean(),
    User.find({
      _id: { $in: [...orders.map((o) => o.patientUserId), ...orders.map((o) => o.pharmacyUserId)] },
    })
      .select("name role pharmacy patient")
      .lean(),
  ]);

  const prescriptionBy = new Map(prescriptions.map((p) => [String(p._id), p]));
  const personBy = new Map(people.map((p) => [String(p._id), p]));

  const clinicians = await User.find({
    _id: { $in: prescriptions.map((p) => p.clinicianUserId) },
  })
    .select("name clinician")
    .lean();
  const clinicianBy = new Map(clinicians.map((c) => [String(c._id), c]));

  return ok({
    orders: orders.map((o) => {
      const prescription = prescriptionBy.get(String(o.prescriptionId));
      const patient = personBy.get(String(o.patientUserId));
      const pharmacy = personBy.get(String(o.pharmacyUserId));
      const clinician = prescription ? clinicianBy.get(String(prescription.clinicianUserId)) : null;

      return {
        id: String(o._id),
        status: o.status,
        method: o.fulfillmentMethod,
        rejectReason: o.rejectReason ?? null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        items: prescription?.items ?? [],
        prescriptionNotes: prescription?.notes ?? null,
        issuedAt: prescription?.issuedAt ?? null,
        prescribedBy: clinician
          ? `${clinician.name}${clinician.clinician?.licenseNo ? ` · ${clinician.clinician.licenseNo}` : ""}`
          : "—",
        patientName: patient?.name ?? "Patient",
        // A pharmacy needs to know about reported allergies before dispensing.
        patientAllergies:
          session.role === "PHARMACY" ? (patient?.patient?.knownAllergies ?? null) : null,
        pharmacyName: pharmacy?.pharmacy?.name ?? pharmacy?.name ?? "Pharmacy",
        pharmacyAddress: pharmacy?.pharmacy?.address ?? "",
      };
    }),
  });
});

export const dynamic = "force-dynamic";

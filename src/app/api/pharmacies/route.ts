import { route, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { User } from "@/lib/models";

/** Verified pharmacies only — an unverified one is never offered to a patient. */
export const GET = route(async () => {
  await requireSession();

  const pharmacies = await User.find({ role: "PHARMACY", "pharmacy.verified": true })
    .select("name pharmacy")
    .sort({ "pharmacy.name": 1 })
    .lean();

  return ok({
    pharmacies: pharmacies.map((p) => ({
      id: String(p._id),
      name: p.pharmacy?.name ?? p.name,
      address: p.pharmacy?.address ?? "",
      phone: p.pharmacy?.phone ?? "",
      openingHours: p.pharmacy?.openingHours ?? "",
      deliveryAvailable: Boolean(p.pharmacy?.deliveryAvailable),
    })),
  });
});

export const dynamic = "force-dynamic";

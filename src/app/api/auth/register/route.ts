import { z } from "zod";
import { route, ok, fail, audit } from "@/lib/api";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { User } from "@/lib/models";

const schema = z
  .object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(8, "Use at least 8 characters"),
    role: z.enum(["PATIENT", "CLINICIAN", "PHARMACY"]),
    // clinician
    specialty: z.string().optional(),
    licenseNo: z.string().optional(),
    // pharmacy
    pharmacyName: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((d) => d.role !== "CLINICIAN" || !!d.licenseNo, {
    message: "A licence number is required to register as a clinician",
    path: ["licenseNo"],
  })
  .refine((d) => d.role !== "PHARMACY" || (!!d.pharmacyName && !!d.address), {
    message: "Pharmacy name and address are required",
    path: ["pharmacyName"],
  });

export const POST = route(async (req: Request) => {
  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase().trim();

  if (await User.findOne({ email })) {
    return fail("An account with that email already exists", 409);
  }

  /**
   * Clinicians and pharmacies register unverified and cannot act on patients
   * until an administrator verifies them (seed §6.4, §17). Patients are usable
   * immediately. The seeded demo accounts come pre-verified.
   */
  const user = await User.create({
    email,
    name: body.name.trim(),
    passwordHash: await hashPassword(body.password),
    role: body.role,
    ...(body.role === "CLINICIAN"
      ? {
          clinician: {
            specialty: body.specialty || "General Practice",
            licenseNo: body.licenseNo,
            verified: false,
          },
        }
      : {}),
    ...(body.role === "PHARMACY"
      ? {
          pharmacy: {
            name: body.pharmacyName,
            address: body.address,
            phone: body.phone || "",
            verified: false,
            deliveryAvailable: true,
          },
        }
      : {}),
    ...(body.role === "PATIENT" ? { patient: {} } : {}),
  });

  await audit({
    actorUserId: String(user._id),
    actorRole: user.role,
    action: "account.registered",
    resource: "User",
    resourceId: String(user._id),
    newState: user.role,
  });

  await setSessionCookie({
    userId: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return ok(
    {
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        verified:
          user.role === "CLINICIAN"
            ? user.clinician?.verified
            : user.role === "PHARMACY"
              ? user.pharmacy?.verified
              : true,
      },
    },
    201,
  );
});

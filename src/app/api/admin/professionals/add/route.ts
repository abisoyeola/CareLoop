import { z } from "zod";
import { route, ok, fail, audit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { User } from "@/lib/models";

const schema = z
  .object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(8, "Use at least 8 characters"),
    role: z.enum(["CLINICIAN", "PHARMACY"]),
    // clinician
    specialty: z.string().optional(),
    licenseNo: z.string().optional(),
    // pharmacy
    pharmacyName: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    deliveryAvailable: z.boolean().optional(),
    openingHours: z.string().optional(),
    // admin can pre-verify the account they're creating
    verified: z.boolean().default(true),
  })
  .refine((d) => d.role !== "CLINICIAN" || !!d.licenseNo, {
    message: "A licence number is required for clinicians",
    path: ["licenseNo"],
  })
  .refine((d) => d.role !== "PHARMACY" || (!!d.pharmacyName && !!d.address), {
    message: "Pharmacy name and address are required",
    path: ["pharmacyName"],
  });

/**
 * Admin creates a new clinician or pharmacy account directly.
 * Accounts created this way are pre-verified by default.
 */
export const POST = route(async (req: Request) => {
  const session = await requireRole("ADMIN");
  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase().trim();

  if (await User.findOne({ email })) {
    return fail("An account with that email already exists", 409);
  }

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
            verified: body.verified,
          },
        }
      : {}),
    ...(body.role === "PHARMACY"
      ? {
          pharmacy: {
            name: body.pharmacyName,
            address: body.address,
            phone: body.phone || "",
            verified: body.verified,
            deliveryAvailable: body.deliveryAvailable ?? true,
            openingHours: body.openingHours || "08:00 - 20:00",
          },
        }
      : {}),
  });

  await audit({
    actorUserId: session.userId,
    actorRole: "ADMIN",
    action: "professional.created-by-admin",
    resource: "User",
    resourceId: String(user._id),
    newState: user.role,
    meta: {
      createdBy: session.email,
      profEmail: user.email,
      role: user.role,
      verified: body.verified,
    },
  });

  return ok(
    {
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        verified: body.verified,
      },
    },
    201,
  );
});

export const dynamic = "force-dynamic";

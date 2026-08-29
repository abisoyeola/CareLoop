import { z } from "zod";
import { route, ok, fail, audit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { User } from "@/lib/models";
import { emitToUser } from "@/lib/realtime";

const schema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/i),
  verified: z.boolean(),
});

/** Human gate on who is allowed to act on patients (hackathon ground rule 05). */
export const POST = route(async (req: Request) => {
  const session = await requireRole("ADMIN");
  const body = schema.parse(await req.json());

  const user = await User.findById(body.userId);
  if (!user) return fail("User not found", 404);
  if (user.role !== "CLINICIAN" && user.role !== "PHARMACY") {
    return fail("Only clinician and pharmacy accounts are verified", 422);
  }

  const prev =
    user.role === "CLINICIAN" ? Boolean(user.clinician?.verified) : Boolean(user.pharmacy?.verified);

  if (user.role === "CLINICIAN" && user.clinician) user.clinician.verified = body.verified;
  if (user.role === "PHARMACY" && user.pharmacy) user.pharmacy.verified = body.verified;
  await user.save();

  await audit({
    actorUserId: session.userId,
    actorRole: "ADMIN",
    action: body.verified ? "account.verified" : "account.verification-revoked",
    resource: "User",
    resourceId: body.userId,
    prevState: String(prev),
    newState: String(body.verified),
    meta: { role: user.role, name: user.name },
  });

  emitToUser(body.userId, "notification", {
    title: body.verified ? "Account verified" : "Verification revoked",
    body: body.verified
      ? "An administrator has verified your account. You can now work with patients."
      : "An administrator has revoked your verification. Contact support.",
  });

  return ok({ userId: body.userId, verified: body.verified });
});

export const dynamic = "force-dynamic";

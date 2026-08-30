import { z } from "zod";
import { route, ok, fail, audit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { User } from "@/lib/models";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
});

/**
 * Allows an existing ADMIN to create a new ADMIN account.
 * Only accessible to authenticated ADMIN sessions.
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
    role: "ADMIN",
  });

  await audit({
    actorUserId: session.userId,
    actorRole: "ADMIN",
    action: "admin.created",
    resource: "User",
    resourceId: String(user._id),
    newState: "ADMIN",
    meta: { createdBy: session.email, newAdminEmail: user.email },
  });

  return ok(
    {
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
    201,
  );
});

export const dynamic = "force-dynamic";

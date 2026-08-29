import { z } from "zod";
import { route, ok, fail, audit } from "@/lib/api";
import { checkPassword, setSessionCookie } from "@/lib/auth";
import { User } from "@/lib/models";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = route(async (req: Request) => {
  const { email, password } = schema.parse(await req.json());

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  // Same message and roughly the same work either way, so the response does not
  // reveal whether an account exists.
  const valid = user ? await checkPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    return fail("Email or password is incorrect", 401);
  }

  await setSessionCookie({
    userId: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
  });

  await audit({
    actorUserId: String(user._id),
    actorRole: user.role,
    action: "account.login",
    resource: "User",
    resourceId: String(user._id),
  });

  return ok({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      verified:
        user.role === "CLINICIAN"
          ? Boolean(user.clinician?.verified)
          : user.role === "PHARMACY"
            ? Boolean(user.pharmacy?.verified)
            : true,
    },
  });
});

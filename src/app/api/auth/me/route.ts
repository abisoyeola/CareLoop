import { route, ok } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { User } from "@/lib/models";

export const GET = route(async () => {
  const session = await getSession();
  if (!session) return ok({ user: null });

  const user = await User.findById(session.userId).lean();
  if (!user) return ok({ user: null });

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
      pharmacy: user.pharmacy ?? null,
      clinician: user.clinician ?? null,
    },
  });
});

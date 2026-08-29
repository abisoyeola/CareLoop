import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const HOME: Record<string, string> = {
  PATIENT: "/app/chat",
  CLINICIAN: "/app/queue",
  PHARMACY: "/app/pharmacy",
  ADMIN: "/app/admin",
};

export default async function AppIndex() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(HOME[session.role] ?? "/app/chat");
}

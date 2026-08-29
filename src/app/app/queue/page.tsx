import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { ClinicianWorkspace } from "@/components/clinician/ClinicianWorkspace";

export const metadata = { title: "Consultation queue — CareLoop" };
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const session = await requireSession();
  if (session.role !== "CLINICIAN") redirect("/app");

  await connectDb();
  const user = await User.findById(session.userId).select("clinician").lean();

  return <ClinicianWorkspace verified={Boolean(user?.clinician?.verified)} />;
}

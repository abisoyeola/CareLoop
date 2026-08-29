import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { CarePanel } from "@/components/patient/CarePanel";

export const metadata = { title: "My care — CareLoop" };
export const dynamic = "force-dynamic";

export default async function CarePage() {
  const session = await requireSession();
  if (session.role !== "PATIENT") redirect("/app");
  return <CarePanel />;
}

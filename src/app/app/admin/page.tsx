import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { AdminBoard } from "@/components/admin/AdminBoard";

export const metadata = { title: "Platform — CareLoop" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/app");
  return <AdminBoard />;
}

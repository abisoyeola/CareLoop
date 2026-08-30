import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { ProfessionalsPanel } from "@/components/admin/ProfessionalsPanel";

export const metadata = { title: "Professionals — CareLoop" };
export const dynamic = "force-dynamic";

export default async function AdminProfessionalsPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/app");
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-4 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Professionals</h1>
          <p className="mt-1 text-sm text-muted">
            Manage clinicians and pharmacies — verify accounts, add new professionals, and view activity.
          </p>
        </div>
        <ProfessionalsPanel />
      </div>
    </div>
  );
}

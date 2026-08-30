import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { AdminAuditLog } from "@/components/admin/AdminAuditLog";

export const metadata = { title: "Audit Trail — CareLoop" };
export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/app");
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
          <p className="mt-1 text-sm text-muted">
            Immutable log of every administrative and clinical action taken on the platform.
          </p>
        </div>
        <AdminAuditLog />
      </div>
    </div>
  );
}

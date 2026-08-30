import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { ShieldCheck, Lock, Users, Activity } from "lucide-react";

export const metadata = { title: "Admin Sign In — CareLoop" };
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Users, label: "Verify clinicians & pharmacies", body: "Approve professional accounts before they can see patients." },
  { icon: Activity, label: "Platform health metrics", body: "Monitor triage pathway distribution and escalation rates." },
  { icon: Lock, label: "Full audit trail", body: "Every action on the platform is recorded and timestamped." },
];

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session?.role === "ADMIN") redirect("/app/admin");
  if (session) redirect("/app");

  return (
    <main className="flex min-h-screen bg-[#080f1a]">
      {/* ── Left panel ───────────────────────────────────────────── */}
      <aside className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden bg-[#0a1f1c] px-12 py-14 text-white lg:flex">
        {/* decorative glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl"
        />

        <div className="relative">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/95 text-base font-bold text-[#0a1f1c]">
              C
            </span>
            <span className="text-lg font-semibold tracking-tight">CareLoop</span>
          </Link>

          <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-teal-700/50 bg-teal-900/40 px-3.5 py-1.5 text-xs font-medium text-teal-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Administrator portal
          </div>

          <h2 className="mt-6 max-w-md text-3xl leading-tight font-semibold tracking-tight">
            Manage the CareLoop platform.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-teal-100/70">
            Verify clinician and pharmacy accounts, monitor triage health signals,
            and maintain the complete audit trail.
          </p>
        </div>

        <ul className="relative space-y-5">
          {FEATURES.map(({ icon: Icon, label, body }) => (
            <li key={label} className="flex gap-3.5">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
              </span>
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-teal-100/60">{body}</div>
              </div>
            </li>
          ))}
        </ul>

        <p className="relative text-xs leading-relaxed text-teal-100/40">
          This portal is restricted to authorised platform administrators. Unauthorized access is prohibited.
        </p>
      </aside>

      {/* ── Right panel — login form ──────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-500 text-sm font-bold text-white">
              C
            </span>
            <span className="font-semibold text-white">CareLoop</span>
          </Link>

          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-teal-800/60 bg-teal-900/30 px-3 py-1 text-xs font-medium text-teal-400">
            <ShieldCheck className="h-3 w-3" />
            Restricted access
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-white">Admin sign in</h1>
          <p className="mt-1 mb-7 text-sm text-slate-400">
            Enter your administrator credentials to continue.
          </p>

          <AdminLoginForm />

          <p className="mt-6 text-center text-sm text-slate-600">
            Not an admin?{" "}
            <Link href="/login" className="font-medium text-teal-500 hover:text-teal-400 transition">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

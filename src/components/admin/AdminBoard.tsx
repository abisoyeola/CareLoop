"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ShieldCheck, Building2, UserCheck, UserPlus, Loader2, Eye, EyeOff } from "lucide-react";
import { useSocketEvent } from "@/components/SocketProvider";
import { Card, EmptyState, Spinner, Stat, PathwayBadge } from "@/components/ui";

interface Overview {
  pending: {
    clinicians: { id: string; name: string; email: string; specialty: string; licenseNo: string }[];
    pharmacies: { id: string; name: string; email: string; pharmacyName: string; address: string }[];
  };
  stats: {
    users: Record<string, number>;
    pathways: Record<string, number>;
    totalAssessments: number;
    escalations: number;
    escalationRate: number;
    consultations: Record<string, number>;
    orders: Record<string, number>;
  };
  audit: unknown[];
}

export function AdminBoard() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Create admin form state ──────────────────────────────────────────────
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "" });
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    const json = await res.json();
    if (res.ok) setData(json);
    else setError(json.error ?? "Could not load the overview");
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useSocketEvent("queue-update", () => reload());

  async function verify(userId: string, verified: boolean) {
    setBusy(userId);
    await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, verified }),
    });
    await reload();
    setBusy(null);
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminBusy(true);
    setAdminError(null);
    setAdminSuccess(null);
    const res = await fetch("/api/admin/create-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminForm),
    });
    const json = await res.json();
    if (res.ok) {
      setAdminSuccess(`Admin account created for ${json.user.email}`);
      setAdminForm({ name: "", email: "", password: "" });
    } else {
      setAdminError(json.error ?? "Failed to create admin");
    }
    setAdminBusy(false);
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        {error ? <p className="text-sm text-red-600">{error}</p> : <Spinner className="h-6 w-6 text-muted" />}
      </div>
    );
  }

  const { stats, pending } = data;
  const pendingCount = pending.clinicians.length + pending.pharmacies.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted">Platform stats, verification queue and account management.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Assessments" value={stats.totalAssessments} />
          <Stat
            label="Rule escalations"
            value={stats.escalations}
            tone="warn"
            hint={stats.totalAssessments ? `${(stats.escalationRate * 100).toFixed(0)}% of assessments` : undefined}
          />
          <Stat label="Awaiting verification" value={pendingCount} tone={pendingCount ? "danger" : "default"} />
          <Stat label="Patients" value={stats.users.PATIENT ?? 0} />
        </div>

        {/* Pathway distribution */}
        <Card>
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Care pathway distribution</h2>
          <p className="mt-1 mb-4 text-xs text-muted">
            A sudden shift in this mix is usually the earliest visible sign that triage has drifted.
          </p>
          {stats.totalAssessments === 0 ? (
            <p className="text-sm text-muted">No assessments yet.</p>
          ) : (
            <div className="space-y-2.5">
              {["RED", "YELLOW", "MEDICATION_REVIEW", "GREEN"].map((p) => {
                const count = stats.pathways[p] ?? 0;
                const pct = (count / stats.totalAssessments) * 100;
                return (
                  <div key={p} className="flex items-center gap-3">
                    <div className="w-40 shrink-0"><PathwayBadge pathway={p} size="sm" /></div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={clsx(
                          "h-full rounded-full",
                          p === "RED" ? "bg-red-500" : p === "YELLOW" ? "bg-amber-500" : p === "MEDICATION_REVIEW" ? "bg-violet-500" : "bg-emerald-500",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{count} · {pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Verification queue */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted uppercase">Awaiting verification</h2>
          {pendingCount === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-8 w-8" />}
              title="Nothing waiting"
              body="Newly registered clinicians and pharmacies appear here before they can act on patients."
            />
          ) : (
            <div className="space-y-2.5">
              {pending.clinicians.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5">
                  <div className="flex items-start gap-3">
                    <UserCheck className="mt-0.5 h-4 w-4 text-muted" />
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted">{c.specialty} · licence {c.licenseNo} · {c.email}</div>
                    </div>
                  </div>
                  <button onClick={() => verify(c.id, true)} disabled={busy === c.id} className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    Verify clinician
                  </button>
                </div>
              ))}
              {pending.pharmacies.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5">
                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-4 w-4 text-muted" />
                    <div>
                      <div className="text-sm font-medium">{p.pharmacyName || p.name}</div>
                      <div className="text-xs text-muted">{p.address} · {p.email}</div>
                    </div>
                  </div>
                  <button onClick={() => verify(p.id, true)} disabled={busy === p.id} className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    Verify pharmacy
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Create admin */}
        <Card>
          <h2 className="mb-1 text-sm font-semibold tracking-wide text-muted uppercase flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Create administrator account
          </h2>
          <p className="mb-5 text-xs text-muted">
            Grant another person admin access. They will be able to log in at <span className="font-mono">/admin-login</span>.
          </p>
          <form onSubmit={createAdmin} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-admin-name" className="mb-1 block text-xs font-medium text-ink-2">Full name</label>
                <input id="new-admin-name" required minLength={2} value={adminForm.name} onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
              </div>
              <div>
                <label htmlFor="new-admin-email" className="mb-1 block text-xs font-medium text-ink-2">Email</label>
                <input id="new-admin-email" type="email" required value={adminForm.email} onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))} placeholder="admin@example.com" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
              </div>
            </div>
            <div>
              <label htmlFor="new-admin-password" className="mb-1 block text-xs font-medium text-ink-2">Temporary password</label>
              <div className="relative">
                <input id="new-admin-password" type={showPwd ? "text" : "password"} required minLength={8} value={adminForm.password} onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" className="w-full rounded-lg border border-line bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? "Hide password" : "Show password"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {adminError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{adminError}</p>}
            {adminSuccess && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">✓ {adminSuccess}</p>}
            <button type="submit" id="create-admin-btn" disabled={adminBusy} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-brand-ink transition">
              {adminBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {adminBusy ? "Creating…" : "Create admin account"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

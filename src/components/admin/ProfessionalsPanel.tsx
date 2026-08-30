"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  Stethoscope,
  Pill,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Search,
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
  X,
  ClipboardList,
  FileText,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { Card, EmptyState, Spinner, PathwayBadge, timeAgo } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Prof {
  id: string;
  name: string;
  email: string;
  role: "CLINICIAN" | "PHARMACY";
  verified: boolean;
  specialty: string | null;
  licenseNo: string | null;
  pharmacyName: string | null;
  address: string | null;
  phone: string | null;
  deliveryAvailable: boolean | null;
  openingHours: string | null;
  consultations: { total: number; completed: number; inProgress: number };
  prescriptions: number;
  lastActivityAt: string | null;
  lastAction: string | null;
  joinedAt: string;
}

interface ProfProfile {
  profile: Prof;
  metrics: {
    totalConsultations: number;
    completedConsultations: number;
    completionRate: number;
    prescriptionsIssued: number;
    avgResponseMinutes: number;
  };
  recentConsultations: {
    id: string;
    state: string;
    pathway: string;
    chiefComplaint: string;
    patientName: string;
    createdAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
  }[];
  activityLog: {
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    prevState: string | null;
    newState: string | null;
    createdAt: string;
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        verified
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-amber-50 text-amber-700 border border-amber-200",
      )}
    >
      {verified ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
      {verified ? "Verified" : "Pending"}
    </span>
  );
}

function StatMini({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

// ── Profile Drawer ────────────────────────────────────────────────────────────

function ProfileDrawer({
  profId,
  onClose,
  onVerifyToggle,
}: {
  profId: string;
  onClose: () => void;
  onVerifyToggle: (id: string, v: boolean) => void;
}) {
  const [data, setData] = useState<ProfProfile | null>(null);
  const [tab, setTab] = useState<"overview" | "consultations" | "log">("overview");
  const [verifyBusy, setVerifyBusy] = useState(false);

  useEffect(() => {
    setData(null);
    setTab("overview");
    fetch(`/api/admin/professionals/${profId}`)
      .then((r) => r.json())
      .then(setData);
  }, [profId]);

  async function toggleVerify() {
    if (!data) return;
    setVerifyBusy(true);
    const next = !data.profile.verified;
    await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profId, verified: next }),
    });
    setData((d) => d && { ...d, profile: { ...d.profile, verified: next } });
    onVerifyToggle(profId, next);
    setVerifyBusy(false);
  }

  const stateColor: Record<string, string> = {
    COMPLETED: "text-emerald-600",
    IN_PROGRESS: "text-brand",
    ACCEPTED: "text-brand",
    QUEUED: "text-amber-600",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white",
                data?.profile.role === "CLINICIAN" ? "bg-brand" : "bg-violet-600",
              )}
            >
              {data?.profile.role === "CLINICIAN" ? (
                <Stethoscope className="h-5 w-5" />
              ) : (
                <Pill className="h-5 w-5" />
              )}
            </span>
            <div>
              <div className="font-semibold text-ink">{data?.profile.name ?? "Loading…"}</div>
              <div className="text-xs text-muted">{data?.profile.email}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!data ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-8 w-8 text-muted" />
          </div>
        ) : (
          <>
            {/* Sub-header: role + verified + toggle */}
            <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-3 bg-surface-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {data.profile.role === "CLINICIAN" ? (
                  <>
                    <span className="font-medium text-ink">{data.profile.specialty ?? "Clinician"}</span>
                    {data.profile.licenseNo && <span>· Lic: {data.profile.licenseNo}</span>}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-ink">{data.profile.pharmacyName ?? data.profile.name}</span>
                    {data.profile.address && <span>· {data.profile.address}</span>}
                  </>
                )}
                <VerifiedBadge verified={data.profile.verified} />
                <span>· Joined {timeAgo(data.profile.joinedAt)}</span>
              </div>
              <button
                onClick={toggleVerify}
                disabled={verifyBusy}
                className={clsx(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                  data.profile.verified
                    ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                    : "bg-brand text-white hover:bg-brand-ink",
                )}
              >
                {verifyBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : data.profile.verified ? (
                  <ShieldOff className="h-3.5 w-3.5" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                {data.profile.verified ? "Revoke" : "Verify"}
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-line px-6">
              {(["overview", "consultations", "log"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx(
                    "border-b-2 px-1 py-3 mr-5 text-xs font-semibold transition capitalize",
                    tab === t
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {t === "log" ? "Activity Log" : t === "consultations" ? "Consultations" : "Overview"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {tab === "overview" && (
                <div className="space-y-5">
                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatMini label="Consultations" value={data.metrics.totalConsultations} />
                    <StatMini
                      label="Completed"
                      value={data.metrics.completedConsultations}
                      sub={`${(data.metrics.completionRate * 100).toFixed(0)}% rate`}
                    />
                    <StatMini label="Prescriptions" value={data.metrics.prescriptionsIssued} />
                    <StatMini
                      label="Avg response"
                      value={
                        data.metrics.avgResponseMinutes > 0
                          ? `${data.metrics.avgResponseMinutes}m`
                          : "—"
                      }
                    />
                  </div>

                  {/* Performance bar */}
                  {data.metrics.totalConsultations > 0 && (
                    <div className="rounded-xl border border-line p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink-2 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" /> Completion rate
                        </span>
                        <span className="tabular-nums font-semibold text-ink">
                          {(data.metrics.completionRate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={clsx(
                            "h-full rounded-full transition-all",
                            data.metrics.completionRate >= 0.8
                              ? "bg-emerald-500"
                              : data.metrics.completionRate >= 0.5
                                ? "bg-amber-500"
                                : "bg-red-500",
                          )}
                          style={{ width: `${data.metrics.completionRate * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Pharmacy-specific info */}
                  {data.profile.role === "PHARMACY" && (
                    <div className="rounded-xl border border-line p-4 space-y-1.5 text-sm">
                      <div className="font-medium text-ink-2 text-xs uppercase tracking-wide mb-2">
                        Pharmacy details
                      </div>
                      {data.profile.phone && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">Phone</span>
                          <span>{data.profile.phone}</span>
                        </div>
                      )}
                      {data.profile.openingHours && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">Hours</span>
                          <span>{data.profile.openingHours}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Delivery</span>
                        <span>{data.profile.deliveryAvailable ? "Available" : "Pickup only"}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "consultations" && (
                <div className="space-y-2">
                  {data.recentConsultations.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-8 w-8" />}
                      title="No consultations yet"
                      body="This professional hasn't handled any consultations."
                    />
                  ) : (
                    data.recentConsultations.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-line p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <PathwayBadge pathway={c.pathway} size="sm" />
                          <span
                            className={clsx(
                              "text-[10px] font-semibold",
                              stateColor[c.state] ?? "text-muted",
                            )}
                          >
                            {c.state.replace("_", " ")}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-ink truncate">
                          {c.chiefComplaint || "No complaint recorded"}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>Patient: {c.patientName}</span>
                          <span>{timeAgo(c.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "log" && (
                <div className="space-y-1">
                  {data.activityLog.length === 0 ? (
                    <EmptyState
                      icon={<Activity className="h-8 w-8" />}
                      title="No activity recorded"
                      body="Actions taken by this professional will appear here."
                    />
                  ) : (
                    data.activityLog.map((a, i) => (
                      <div
                        key={a.id}
                        className="flex items-start gap-3 py-2.5 border-b border-line/60 last:border-0"
                      >
                        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand/40 mt-2" />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs text-ink-2">{a.action}</div>
                          {(a.prevState || a.newState) && (
                            <div className="text-[10px] text-muted font-mono mt-0.5">
                              {a.prevState ?? "—"} → {a.newState ?? "—"}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-[10px] text-muted whitespace-nowrap">
                          {timeAgo(a.createdAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

// ── Add Professional Form ─────────────────────────────────────────────────────

function AddProfForm({ onSuccess }: { onSuccess: () => void }) {
  const [role, setRole] = useState<"CLINICIAN" | "PHARMACY">("CLINICIAN");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok2, setOk] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    specialty: "",
    licenseNo: "",
    pharmacyName: "",
    address: "",
    phone: "",
    verified: true,
  });

  const field =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

  function set(k: string, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    const res = await fetch("/api/admin/professionals/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role }),
    });
    const json = await res.json();
    if (res.ok) {
      setOk(`${json.user.name} (${json.user.email}) created successfully.`);
      setForm({ name: "", email: "", password: "", specialty: "", licenseNo: "", pharmacyName: "", address: "", phone: "", verified: true });
      onSuccess();
    } else {
      const msg = json.issues?.map((i: { message: string }) => i.message).join(". ") ?? json.error ?? "Failed";
      setErr(msg);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Role toggle */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-2">Role</label>
        <div className="grid grid-cols-2 gap-2">
          {(["CLINICIAN", "PHARMACY"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                role === r
                  ? "border-brand bg-brand-soft/60 text-brand ring-1 ring-brand/20"
                  : "border-line text-muted hover:border-slate-300",
              )}
            >
              {r === "CLINICIAN" ? <Stethoscope className="h-4 w-4" /> : <Pill className="h-4 w-4" />}
              {r === "CLINICIAN" ? "Clinician" : "Pharmacy"}
            </button>
          ))}
        </div>
      </div>

      {/* Base fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="prof-name" className="mb-1 block text-xs font-medium text-ink-2">Full name</label>
          <input id="prof-name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dr. Jane Smith" className={field} />
        </div>
        <div>
          <label htmlFor="prof-email" className="mb-1 block text-xs font-medium text-ink-2">Email</label>
          <input id="prof-email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@clinic.com" className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="prof-password" className="mb-1 block text-xs font-medium text-ink-2">
          Temporary password
        </label>
        <div className="relative">
          <input
            id="prof-password"
            type={showPwd ? "text" : "password"}
            required
            minLength={8}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="At least 8 characters"
            className={field + " pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition"
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Clinician-specific */}
      {role === "CLINICIAN" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="prof-license" className="mb-1 block text-xs font-medium text-ink-2">Licence number *</label>
            <input id="prof-license" required value={form.licenseNo} onChange={(e) => set("licenseNo", e.target.value)} placeholder="MDCN/12345" className={field} />
          </div>
          <div>
            <label htmlFor="prof-specialty" className="mb-1 block text-xs font-medium text-ink-2">Specialty</label>
            <input id="prof-specialty" value={form.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="General Practice" className={field} />
          </div>
        </div>
      )}

      {/* Pharmacy-specific */}
      {role === "PHARMACY" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prof-phname" className="mb-1 block text-xs font-medium text-ink-2">Pharmacy name *</label>
              <input id="prof-phname" required value={form.pharmacyName} onChange={(e) => set("pharmacyName", e.target.value)} placeholder="City Pharmacy" className={field} />
            </div>
            <div>
              <label htmlFor="prof-phone" className="mb-1 block text-xs font-medium text-ink-2">Phone</label>
              <input id="prof-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234 8xx xxx xxxx" className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="prof-address" className="mb-1 block text-xs font-medium text-ink-2">Address *</label>
            <input id="prof-address" required value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="12 Hospital Road, Lagos" className={field} />
          </div>
        </div>
      )}

      {/* Pre-verify checkbox */}
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line p-3 hover:bg-slate-50 transition">
        <input
          type="checkbox"
          checked={form.verified}
          onChange={(e) => set("verified", e.target.checked)}
          className="h-4 w-4 rounded accent-brand"
        />
        <div>
          <div className="text-sm font-medium text-ink">Pre-verify account</div>
          <div className="text-xs text-muted">Account can start working with patients immediately.</div>
        </div>
      </label>

      {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {ok2 && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">✓ {ok2}</p>}

      <button
        type="submit"
        id="add-prof-btn"
        disabled={busy}
        className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink disabled:opacity-50 transition"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        {busy ? "Creating…" : "Add professional"}
      </button>
    </form>
  );
}

// ── Professionals Panel (main export) ─────────────────────────────────────────

export function ProfessionalsPanel() {
  const [data, setData] = useState<{ clinicians: Prof[]; pharmacies: Prof[] } | null>(null);
  const [filter, setFilter] = useState<"ALL" | "CLINICIAN" | "PHARMACY">("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/professionals");
    const json = await res.json();
    if (res.ok) setData(json);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleVerify(id: string, verified: boolean) {
    setVerifyBusy(id);
    setVerifyError(null);
    setVerifySuccess(null);

    // Optimistically update local state immediately so the UI responds
    setData((prev) => {
      if (!prev) return prev;
      const patch = (list: Prof[]) =>
        list.map((p) => (p.id === id ? { ...p, verified } : p));
      return { clinicians: patch(prev.clinicians), pharmacies: patch(prev.pharmacies) };
    });

    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, verified }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Roll back optimistic update
        setData((prev) => {
          if (!prev) return prev;
          const patch = (list: Prof[]) =>
            list.map((p) => (p.id === id ? { ...p, verified: !verified } : p));
          return { clinicians: patch(prev.clinicians), pharmacies: patch(prev.pharmacies) };
        });
        setVerifyError(json.error ?? "Verification failed. Please try again.");
      } else {
        setVerifySuccess(verified ? "Account verified successfully." : "Verification revoked.");
        setTimeout(() => setVerifySuccess(null), 3000);
        // Re-fetch in background to sync any server-side changes
        load();
      }
    } catch {
      setVerifyError("Network error. Could not reach the server.");
    } finally {
      setVerifyBusy(null);
    }
  }

  if (!data)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8 text-muted" />
      </div>
    );

  const all: Prof[] = [
    ...(filter !== "PHARMACY" ? data.clinicians : []),
    ...(filter !== "CLINICIAN" ? data.pharmacies : []),
  ].filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.specialty ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.pharmacyName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Professionals</h2>
          <p className="text-xs text-muted mt-0.5">
            {data.clinicians.length} clinician{data.clinicians.length !== 1 ? "s" : ""} ·{" "}
            {data.pharmacies.length} pharmac{data.pharmacies.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink transition"
        >
          <UserPlus className="h-4 w-4" />
          Add professional
        </button>
      </div>

      {/* Verify feedback banners */}
      {verifyError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>⚠ {verifyError}</span>
          <button onClick={() => setVerifyError(null)} className="text-red-400 hover:text-red-700 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {verifySuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {verifySuccess}
        </div>
      )}

      {/* Add form (collapsible) */}
      {showAdd && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-ink">Add new professional</h3>
            <button onClick={() => setShowAdd(false)} className="text-muted hover:text-ink transition">
              <X className="h-4 w-4" />
            </button>
          </div>
          <AddProfForm
            onSuccess={() => {
              load();
              setShowAdd(false);
            }}
          />
        </Card>
      )}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line overflow-hidden text-xs font-semibold">
          {(["ALL", "CLINICIAN", "PHARMACY"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "px-3 py-1.5 transition",
                filter === f ? "bg-brand text-white" : "bg-white text-muted hover:text-ink",
              )}
            >
              {f === "ALL" ? "All" : f === "CLINICIAN" ? "Clinicians" : "Pharmacies"}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, specialty…"
            className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>

      {/* Table */}
      {all.length === 0 ? (
        <EmptyState
          icon={<Stethoscope className="h-8 w-8" />}
          title="No professionals found"
          body={search ? "Try a different search term." : "Add a clinician or pharmacy to get started."}
        />
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left">
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted">Name</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted">Role</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted">Status</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted hidden sm:table-cell">Consultations</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted hidden md:table-cell">Last active</th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {all.map((p) => (
                  <tr
                    key={p.id}
                    className="group border-b border-line/60 last:border-0 hover:bg-slate-50 cursor-pointer transition"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={clsx(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white text-xs",
                            p.role === "CLINICIAN" ? "bg-brand/90" : "bg-violet-600/90",
                          )}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-ink truncate">{p.name}</div>
                          <div className="text-[11px] text-muted truncate">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs text-ink-2">
                        {p.role === "CLINICIAN" ? (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="h-3 w-3 text-brand" />
                            {p.specialty ?? "Clinician"}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Pill className="h-3 w-3 text-violet-600" />
                            Pharmacy
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <VerifiedBadge verified={p.verified} />
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <div className="text-xs tabular-nums text-ink-2">
                        {p.consultations.total}
                        {p.consultations.completed > 0 && (
                          <span className="ml-1 text-muted">({p.consultations.completed} done)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-xs text-muted whitespace-nowrap">
                      {p.lastActivityAt ? timeAgo(p.lastActivityAt) : "No activity yet"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {!p.verified && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleVerify(p.id, true); }}
                            disabled={verifyBusy === p.id}
                            className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-ink disabled:opacity-50 transition"
                          >
                            {verifyBusy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedId(p.id); }}
                          className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-ink transition"
                          title="View profile"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Profile drawer */}
      {selectedId && (
        <ProfileDrawer
          profId={selectedId}
          onClose={() => setSelectedId(null)}
          onVerifyToggle={(id, v) => {
            toggleVerify(id, v);
          }}
        />
      )}
    </div>
  );
}

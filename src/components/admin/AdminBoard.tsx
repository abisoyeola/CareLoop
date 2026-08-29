"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ShieldCheck, Building2, UserCheck } from "lucide-react";
import { useSocketEvent } from "@/components/SocketProvider";
import { Card, EmptyState, Spinner, Stat, PathwayBadge, timeAgo } from "@/components/ui";

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
  audit: {
    id: string;
    action: string;
    resource: string;
    actor: string;
    actorRole: string;
    prevState: string | null;
    newState: string | null;
    createdAt: string;
  }[];
}

export function AdminBoard() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    const json = await res.json();
    if (res.ok) setData(json);
    else setError(json.error ?? "Could not load the overview");
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useSocketEvent("queue-update", () => reload());

  async function verify(userId: string, verified: boolean) {
    setBusy(userId);
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, verified }),
    });
    if (res.ok) await reload();
    setBusy(null);
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        {error ? <p className="text-sm text-red-600">{error}</p> : <Spinner className="h-6 w-6 text-muted" />}
      </div>
    );
  }

  const { stats, pending, audit } = data;
  const pendingCount = pending.clinicians.length + pending.pharmacies.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
          <p className="mt-1 text-sm text-muted">
            Verification, safety signals and the audit trail.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Assessments" value={stats.totalAssessments} />
          <Stat
            label="Rule escalations"
            value={stats.escalations}
            tone="warn"
            hint={
              stats.totalAssessments
                ? `${(stats.escalationRate * 100).toFixed(0)}% of assessments`
                : undefined
            }
          />
          <Stat
            label="Awaiting verification"
            value={pendingCount}
            tone={pendingCount ? "danger" : "default"}
          />
          <Stat label="Patients" value={stats.users.PATIENT ?? 0} />
        </div>

        {/* pathway distribution — a sudden shift here is the first sign of drift */}
        <Card>
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
            Care pathway distribution
          </h2>
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
                    <div className="w-40 shrink-0">
                      <PathwayBadge pathway={p} size="sm" />
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={clsx(
                          "h-full rounded-full",
                          p === "RED"
                            ? "bg-red-500"
                            : p === "YELLOW"
                              ? "bg-amber-500"
                              : p === "MEDICATION_REVIEW"
                                ? "bg-violet-500"
                                : "bg-emerald-500",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">
                      {count} · {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* verification */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted uppercase">
            Awaiting verification
          </h2>

          {pendingCount === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-8 w-8" />}
              title="Nothing waiting"
              body="Newly registered clinicians and pharmacies appear here before they can act on patients."
            />
          ) : (
            <div className="space-y-2.5">
              {pending.clinicians.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <UserCheck className="mt-0.5 h-4 w-4 text-muted" />
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted">
                        {c.specialty} · licence {c.licenseNo} · {c.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => verify(c.id, true)}
                    disabled={busy === c.id}
                    className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Verify clinician
                  </button>
                </div>
              ))}

              {pending.pharmacies.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-4 w-4 text-muted" />
                    <div>
                      <div className="text-sm font-medium">{p.pharmacyName || p.name}</div>
                      <div className="text-xs text-muted">
                        {p.address} · {p.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => verify(p.id, true)}
                    disabled={busy === p.id}
                    className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Verify pharmacy
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* audit */}
        <Card padded={false}>
          <h2 className="border-b border-line px-5 py-4 text-sm font-semibold tracking-wide text-muted uppercase">
            Audit trail
          </h2>
          <div className="max-h-96 overflow-y-auto">
            {audit.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Nothing recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-2.5 font-mono text-xs whitespace-nowrap">
                        <span
                          className={clsx(
                            a.action.includes("escalat") || a.action.includes("revised")
                              ? "text-amber-700"
                              : a.action.includes("prescription")
                                ? "text-violet-700"
                                : "text-ink-2",
                          )}
                        >
                          {a.action}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted">
                        {a.actor}
                        <span className="ml-1 opacity-60">({a.actorRole.toLowerCase()})</span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted">
                        {a.prevState || a.newState ? (
                          <span className="font-mono">
                            {a.prevState ?? "—"} → {a.newState ?? "—"}
                          </span>
                        ) : (
                          a.resource
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right text-xs whitespace-nowrap text-muted">
                        {timeAgo(a.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

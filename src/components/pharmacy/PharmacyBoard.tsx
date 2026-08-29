"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Truck, Store, Pill, AlertTriangle } from "lucide-react";
import { useSocketEvent } from "@/components/SocketProvider";
import { Card, EmptyState, Spinner, Stat, timeAgo } from "@/components/ui";

interface OrderRow {
  id: string;
  status: string;
  method: string;
  rejectReason: string | null;
  createdAt: string;
  items: { name: string; dose: string; frequency: string; duration: string }[];
  prescriptionNotes: string | null;
  prescribedBy: string;
  patientName: string;
  patientAllergies: string | null;
}

/** Mirrors the server-side transition map so the UI cannot offer an illegal move. */
const NEXT: Record<string, { status: string; label: string; tone?: "danger" }[]> = {
  PENDING: [
    { status: "ACCEPTED", label: "Accept — stock available" },
    { status: "REJECTED", label: "Reject", tone: "danger" },
  ],
  ACCEPTED: [
    { status: "PREPARING", label: "Start preparing" },
    { status: "REJECTED", label: "Reject", tone: "danger" },
  ],
  PREPARING: [
    { status: "READY", label: "Ready for collection" },
    { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  ],
  READY: [{ status: "COMPLETED", label: "Collected" }],
  OUT_FOR_DELIVERY: [{ status: "COMPLETED", label: "Delivered" }],
  COMPLETED: [],
  REJECTED: [],
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  ACCEPTED: "bg-sky-50 text-sky-700 border-sky-200",
  PREPARING: "bg-sky-50 text-sky-700 border-sky-200",
  READY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OUT_FOR_DELIVERY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-slate-100 text-slate-600 border-slate-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

export function PharmacyBoard({ verified }: { verified: boolean }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const reload = useCallback(async () => {
    const res = await fetch("/api/orders");
    const data = await res.json();
    if (res.ok) setOrders(data.orders);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useSocketEvent("order-update", () => reload());

  async function update(id: string, status: string, why?: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/orders/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason: why }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Could not update that order");
    else await reload();
    setBusy(null);
    setRejecting(null);
    setReason("");
  }

  const open = orders.filter((o) => !["COMPLETED", "REJECTED"].includes(o.status));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-muted" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fulfilment</h1>
          <p className="mt-1 text-sm text-muted">
            Prescriptions sent to you by patients, each issued by a verified clinician.
          </p>
        </div>

        {!verified && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your pharmacy is awaiting administrator verification. Patients cannot send you
            prescriptions and you cannot update orders until that is done.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Open" value={open.length} />
          <Stat label="Awaiting you" value={orders.filter((o) => o.status === "PENDING").length} tone="warn" />
          <Stat label="Ready" value={orders.filter((o) => o.status === "READY").length} tone="good" />
          <Stat label="Completed" value={orders.filter((o) => o.status === "COMPLETED").length} />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {orders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Pill className="h-8 w-8" />}
              title="No prescriptions yet"
              body="When a patient sends you a prescription it appears here immediately."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Card key={o.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{o.patientName}</span>
                      <span
                        className={clsx(
                          "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          STATUS_STYLE[o.status],
                        )}
                      >
                        {o.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      {o.method === "DELIVERY" ? (
                        <Truck className="h-3.5 w-3.5" />
                      ) : (
                        <Store className="h-3.5 w-3.5" />
                      )}
                      {o.method.toLowerCase()} · prescribed by {o.prescribedBy} ·{" "}
                      {timeAgo(o.createdAt)}
                    </div>
                  </div>
                </div>

                {o.patientAllergies && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>Patient-reported allergies:</strong> {o.patientAllergies}
                    </span>
                  </p>
                )}

                <ul className="mt-3 space-y-1.5">
                  {o.items.map((i, idx) => (
                    <li key={idx} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="font-medium">{i.name}</span> — {i.dose}, {i.frequency},{" "}
                      {i.duration}
                    </li>
                  ))}
                </ul>

                {o.prescriptionNotes && (
                  <p className="mt-2.5 text-sm text-muted">{o.prescriptionNotes}</p>
                )}

                {o.rejectReason && (
                  <p className="mt-2.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    Rejected: {o.rejectReason}
                  </p>
                )}

                {verified && NEXT[o.status]?.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {NEXT[o.status]
                      .filter(
                        (n) => !(n.status === "OUT_FOR_DELIVERY" && o.method !== "DELIVERY"),
                      )
                      .map((n) => (
                        <button
                          key={n.status}
                          onClick={() =>
                            n.status === "REJECTED" ? setRejecting(o.id) : update(o.id, n.status)
                          }
                          disabled={busy === o.id}
                          className={clsx(
                            "rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50",
                            n.tone === "danger"
                              ? "border border-red-200 text-red-700 hover:bg-red-50"
                              : "bg-brand text-white hover:bg-brand-ink",
                          )}
                        >
                          {n.label}
                        </button>
                      ))}
                  </div>
                )}

                {rejecting === o.id && (
                  <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <label htmlFor={`reason-${o.id}`} className="block text-xs font-medium text-red-800">
                      Why can&rsquo;t this be fulfilled? The patient and clinician will see this.
                    </label>
                    <input
                      id={`reason-${o.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Out of stock — expecting delivery Thursday"
                      className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => update(o.id, "REJECTED", reason)}
                        disabled={!reason.trim()}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                      >
                        Confirm rejection
                      </button>
                      <button
                        onClick={() => {
                          setRejecting(null);
                          setReason("");
                        }}
                        className="rounded-lg px-3 py-1.5 text-sm text-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

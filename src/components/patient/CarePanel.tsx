"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Send, Pill, Truck, Store, HeartPulse, CheckCircle2 } from "lucide-react";
import { useSocketEvent } from "@/components/SocketProvider";
import {
  PathwayBadge,
  Card,
  EmptyState,
  Spinner,
  timeAgo,
  clockTime,
} from "@/components/ui";

interface ConsultationRow {
  id: string;
  state: string;
  pathway: string;
  chiefComplaint: string;
  clinicianName: string | null;
  createdAt: string;
}

interface ThreadMessage {
  id: string;
  role: string;
  content: string;
  kind: string;
  createdAt: string;
}

interface PrescriptionRow {
  id: string;
  items: { name: string; dose: string; frequency: string; duration: string }[];
  notes: string | null;
  issuedAt: string;
  prescribedBy: string;
  order: {
    id: string;
    status: string;
    method: string;
    rejectReason: string | null;
    pharmacyName: string;
    pharmacyAddress: string;
  } | null;
}

interface PharmacyRow {
  id: string;
  name: string;
  address: string;
  openingHours: string;
  deliveryAvailable: boolean;
}

/** Fulfilment stages in order, so the tracker can show progress (seed §18). */
const FULFILMENT_STEPS = ["PENDING", "ACCEPTED", "PREPARING", "READY", "COMPLETED"];

const STATUS_COPY: Record<string, string> = {
  PENDING: "Sent — waiting for the pharmacy",
  ACCEPTED: "Pharmacy accepted",
  PREPARING: "Being prepared",
  READY: "Ready for collection",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Fulfilled",
  REJECTED: "Could not be fulfilled",
};

export function CarePanel() {
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const [c, p, ph] = await Promise.all([
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/prescriptions").then((r) => r.json()),
      fetch("/api/pharmacies").then((r) => r.json()),
    ]);
    if (c.consultations) setConsultations(c.consultations);
    if (p.prescriptions) setPrescriptions(p.prescriptions);
    if (ph.pharmacies) setPharmacies(ph.pharmacies);
    setLoading(false);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/consultations/${id}`);
    const data = await res.json();
    if (res.ok) setMessages(data.messages);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (activeId) loadThread(activeId);
  }, [activeId, loadThread]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useSocketEvent<{ consultationId: string; message: ThreadMessage }>("message", (p) => {
    if (p.consultationId !== activeId) return;
    setMessages((prev) =>
      prev.some((m) => m.id === p.message.id) ? prev : [...prev, p.message],
    );
  });
  useSocketEvent("consultation-update", () => reload());
  useSocketEvent("order-update", () => reload());

  async function send() {
    if (!activeId || !draft.trim()) return;
    setBusy(true);
    const text = draft;
    setDraft("");
    const res = await fetch(`/api/consultations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not send");
      setDraft(text);
    } else {
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
      );
    }
    setBusy(false);
  }

  async function order(prescriptionId: string, pharmacyUserId: string, method: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/prescriptions/${prescriptionId}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pharmacyUserId, fulfillmentMethod: method }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Could not send to that pharmacy");
    else await reload();
    setBusy(false);
  }

  const active = consultations.find((c) => c.id === activeId) ?? null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-muted" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My care</h1>
          <p className="mt-1 text-sm text-muted">
            Your consultations, prescriptions and pharmacy orders.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* ---- consultations ---- */}
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
            Consultations
          </h2>

          {consultations.length === 0 ? (
            <Card>
              <EmptyState
                icon={<HeartPulse className="h-8 w-8" />}
                title="No consultations yet"
                body="Finish a health chat and request a clinician — the conversation will appear here."
              />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
              <div className="space-y-2">
                {consultations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={clsx(
                      "w-full rounded-xl border p-3.5 text-left transition",
                      activeId === c.id
                        ? "border-brand bg-brand-soft/40"
                        : "border-line bg-surface hover:border-slate-300",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <PathwayBadge pathway={c.pathway} size="sm" />
                      <span className="text-[11px] text-muted">{timeAgo(c.createdAt)}</span>
                    </div>
                    <div className="mt-1.5 text-sm font-medium">{c.chiefComplaint || "Consultation"}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {c.state === "QUEUED"
                        ? "Waiting for a clinician"
                        : c.clinicianName
                          ? `${c.clinicianName} · ${c.state.replace("_", " ").toLowerCase()}`
                          : c.state.toLowerCase()}
                    </div>
                  </button>
                ))}
              </div>

              <Card padded={false} className="flex min-h-72 flex-col">
                {!active ? (
                  <EmptyState title="Select a consultation" body="Your messages with the clinician appear here." />
                ) : (
                  <>
                    <div className="border-b border-line px-4 py-3">
                      <div className="text-sm font-semibold">
                        {active.clinicianName ?? "Awaiting a clinician"}
                      </div>
                      <div className="text-[11px] text-muted">
                        {active.state.replace("_", " ").toLowerCase()}
                      </div>
                    </div>

                    <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                      {messages.length === 0 && (
                        <p className="py-6 text-center text-xs text-muted">
                          No messages yet.
                        </p>
                      )}
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={clsx(
                            "flex",
                            m.kind === "SYSTEM_EVENT"
                              ? "justify-center"
                              : m.role === "PATIENT"
                                ? "justify-end"
                                : "justify-start",
                          )}
                        >
                          <div
                            className={clsx(
                              "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                              m.kind === "SYSTEM_EVENT"
                                ? "bg-amber-50 text-center text-xs text-amber-900"
                                : m.role === "PATIENT"
                                  ? "bg-brand text-white"
                                  : "bg-slate-100 text-ink-2",
                            )}
                          >
                            {m.content}
                            <div
                              className={clsx(
                                "mt-1 text-[10px]",
                                m.role === "PATIENT" ? "text-white/70" : "text-muted",
                              )}
                            >
                              {clockTime(m.createdAt)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {active.state !== "QUEUED" && active.state !== "COMPLETED" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          send();
                        }}
                        className="flex gap-2 border-t border-line px-4 py-3"
                      >
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="Reply to your clinician…"
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                        />
                        <button
                          type="submit"
                          disabled={busy || !draft.trim()}
                          aria-label="Send"
                          className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white disabled:opacity-40"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </form>
                    )}
                  </>
                )}
              </Card>
            </div>
          )}
        </section>

        {/* ---- prescriptions ---- */}
        {prescriptions.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
              Prescriptions
            </h2>
            <div className="space-y-3">
              {prescriptions.map((p) => (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Pill className="h-4 w-4 text-brand" />
                        Issued by {p.prescribedBy}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">{timeAgo(p.issuedAt)}</div>
                    </div>
                    {p.order && (
                      <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium">
                        {STATUS_COPY[p.order.status] ?? p.order.status}
                      </span>
                    )}
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {p.items.map((i, idx) => (
                      <li key={idx} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                        <span className="font-medium">{i.name}</span> — {i.dose}, {i.frequency},{" "}
                        {i.duration}
                      </li>
                    ))}
                  </ul>

                  {p.notes && <p className="mt-2.5 text-sm text-muted">{p.notes}</p>}

                  {p.order ? (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 text-sm">
                        {p.order.method === "DELIVERY" ? (
                          <Truck className="h-4 w-4 text-muted" />
                        ) : (
                          <Store className="h-4 w-4 text-muted" />
                        )}
                        <span className="font-medium">{p.order.pharmacyName}</span>
                        <span className="text-muted">· {p.order.pharmacyAddress}</span>
                      </div>

                      {p.order.status === "REJECTED" ? (
                        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {p.order.rejectReason ?? "The pharmacy could not fulfil this."}
                        </p>
                      ) : (
                        <ol className="mt-3 flex items-center gap-1">
                          {FULFILMENT_STEPS.map((step) => {
                            const currentIndex = FULFILMENT_STEPS.indexOf(
                              p.order!.status === "OUT_FOR_DELIVERY" ? "READY" : p.order!.status,
                            );
                            const idx = FULFILMENT_STEPS.indexOf(step);
                            const done = idx <= currentIndex;
                            return (
                              <li key={step} className="flex flex-1 flex-col gap-1.5">
                                <span
                                  className={clsx(
                                    "h-1.5 rounded-full",
                                    done ? "bg-brand" : "bg-slate-200",
                                  )}
                                />
                                <span
                                  className={clsx(
                                    "text-[10px]",
                                    done ? "font-medium text-brand-ink" : "text-muted",
                                  )}
                                >
                                  {step === "PENDING"
                                    ? "Sent"
                                    : step.charAt(0) + step.slice(1).toLowerCase()}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  ) : (
                    <PharmacyPicker
                      pharmacies={pharmacies}
                      busy={busy}
                      onChoose={(pharmacyUserId, method) => order(p.id, pharmacyUserId, method)}
                    />
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PharmacyPicker({
  pharmacies,
  busy,
  onChoose,
}: {
  pharmacies: PharmacyRow[];
  busy: boolean;
  onChoose: (pharmacyUserId: string, method: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const [method, setMethod] = useState("PICKUP");
  const pharmacy = pharmacies.find((p) => p.id === selected);

  if (pharmacies.length === 0) {
    return (
      <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No verified pharmacies are available yet. An administrator has to verify one first.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">
        Choose a verified pharmacy
      </h4>
      <div className="mt-2.5 space-y-2">
        {pharmacies.map((p) => (
          <label
            key={p.id}
            className={clsx(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
              selected === p.id ? "border-brand bg-brand-soft/40" : "border-line hover:border-slate-300",
            )}
          >
            <input
              type="radio"
              name="pharmacy"
              value={p.id}
              checked={selected === p.id}
              onChange={() => {
                setSelected(p.id);
                if (!p.deliveryAvailable) setMethod("PICKUP");
              }}
              className="mt-1 accent-teal-600"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{p.name}</span>
              <span className="block text-xs text-muted">{p.address}</span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {p.openingHours}
                {p.deliveryAvailable ? " · delivery available" : " · pickup only"}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(["PICKUP", "DELIVERY"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === "DELIVERY" && pharmacy ? !pharmacy.deliveryAvailable : false}
              onClick={() => setMethod(m)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition disabled:opacity-40",
                method === m ? "bg-white shadow-sm" : "text-muted",
              )}
            >
              {m.toLowerCase()}
            </button>
          ))}
        </div>

        <button
          onClick={() => selected && onChoose(selected, method)}
          disabled={busy || !selected}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <CheckCircle2 className="h-4 w-4" />
          Send prescription
        </button>
      </div>
    </div>
  );
}

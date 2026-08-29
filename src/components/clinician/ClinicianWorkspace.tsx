"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ShieldAlert,
  ChevronDown,
  Send,
  Plus,
  Trash2,
  FileText,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { useSocketEvent } from "@/components/SocketProvider";
import {
  PathwayBadge,
  PATHWAY_META,
  Card,
  EmptyState,
  Spinner,
  timeAgo,
  clockTime,
} from "@/components/ui";

/* ------------------------------------------------------------------ types */

interface QueueRow {
  id: string;
  state: string;
  pathway: string;
  aiPathway: string | null;
  escalated: boolean;
  chiefComplaint: string;
  summary: string;
  patientName: string;
  mine: boolean;
  createdAt: string;
}

interface ThreadMessage {
  id: string;
  role: string;
  content: string;
  kind: string;
  createdAt: string;
}

interface RuleFired {
  id: string;
  label: string;
  evidence: string;
}

interface CaseDetail {
  consultation: {
    id: string;
    state: string;
    mine: boolean;
    clinicianPathway: string | null;
    clinicianNotes: string | null;
  };
  patient: {
    name: string;
    dateOfBirth: string | null;
    knownAllergies: string | null;
    currentMeds: string | null;
  } | null;
  assessment: {
    chiefComplaint: string;
    duration: string;
    severity: string;
    symptoms: string[];
    redFlags: string[];
    allergies: string[];
    medications: string[];
    history: string[];
    summary: string;
    aiPathway: string;
    finalPathway: string;
    verification: {
      escalated: boolean;
      escalatedFrom?: string;
      escalationReason?: string;
      rulesFired: RuleFired[];
      missingFields: string[];
    };
    telemetry: { latencyMs?: number; costUsd?: number; model?: string } | null;
  } | null;
  aiConversation: ThreadMessage[];
  messages: ThreadMessage[];
  attachments: {
    id: string;
    filename: string;
    kind: string;
    mimeType: string;
    extraction: {
      findings?: string[];
      values?: { label: string; value: string; flag?: string }[];
      redFlags?: string[];
      legible?: boolean;
      caveat?: string;
    } | null;
  }[];
  prescription: {
    id: string;
    items: { name: string; dose: string; frequency: string; duration: string }[];
    notes: string | null;
  } | null;
}

interface Item {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
}

const EMPTY_ITEM: Item = { name: "", dose: "", frequency: "", duration: "" };

/* ------------------------------------------------------------- component */

export function ClinicianWorkspace({ verified }: { verified: boolean }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [tab, setTab] = useState<"queue" | "mine">("queue");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const res = await fetch("/api/consultations");
    const data = await res.json();
    if (res.ok) setRows(data.consultations);
    setLoading(false);
  }, []);

  const loadCase = useCallback(async (id: string) => {
    const res = await fetch(`/api/consultations/${id}`);
    const data = await res.json();
    if (res.ok) setDetail(data);
    else setError(data.error ?? "Could not load that case");
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (activeId) loadCase(activeId);
  }, [activeId, loadCase]);

  useSocketEvent("queue-update", () => loadQueue());
  useSocketEvent<{ consultationId: string; message: ThreadMessage }>("message", (p) => {
    if (p.consultationId !== activeId) return;
    setDetail((prev) =>
      prev && !prev.messages.some((m) => m.id === p.message.id)
        ? { ...prev, messages: [...prev.messages, p.message] }
        : prev,
    );
  });

  const visible = rows.filter((r) => (tab === "mine" ? r.mine : r.state === "QUEUED"));

  async function act(path: string, body?: unknown) {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/consultations/${activeId}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.issues?.length
            ? data.issues.map((i: { message: string }) => i.message).join(". ")
            : (data.error ?? "That didn't work"),
        );
        return false;
      }
      await Promise.all([loadCase(activeId), loadQueue()]);
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* queue rail */}
      <div className="hidden w-80 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="border-b border-line px-4 py-3.5">
          <h1 className="text-base font-semibold">Consultations</h1>
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["queue", "mine"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition",
                  tab === t ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {t === "queue" ? "Unclaimed" : "My cases"}
                <span className="ml-1.5 text-[10px] text-muted">
                  {rows.filter((r) => (t === "mine" ? r.mine : r.state === "QUEUED")).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-5 w-5 text-muted" />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title={tab === "queue" ? "Queue is clear" : "No cases yet"}
              body={
                tab === "queue"
                  ? "New consultation requests appear here the moment a patient sends one."
                  : "Cases you accept will show up here."
              }
            />
          ) : (
            visible.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                className={clsx(
                  "w-full border-b border-line/70 px-4 py-3 text-left transition",
                  activeId === r.id ? "bg-brand-soft/40" : "hover:bg-slate-50",
                  r.pathway === "RED" && activeId !== r.id && "bg-red-50/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <PathwayBadge pathway={r.pathway} size="sm" />
                  <span className="text-[11px] text-muted">{timeAgo(r.createdAt)}</span>
                </div>
                <div className="mt-1.5 truncate text-sm font-medium">{r.chiefComplaint || "—"}</div>
                <div className="truncate text-xs text-muted">{r.patientName}</div>
                {r.escalated && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                    <ShieldAlert className="h-3 w-3" />
                    Escalated by safety rules
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* case detail */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-bg">
        {!verified && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">
            Your clinician account is awaiting verification. You can read cases but cannot
            accept, message, prescribe, or complete them.
          </div>
        )}

        {!detail ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="Select a consultation"
              body="Pick a case from the queue to see the structured summary, the full AI conversation, and what the safety layer did."
            />
          </div>
        ) : (
          <CaseView
            detail={detail}
            verified={verified}
            busy={busy}
            error={error}
            onAccept={() => act("accept")}
            onSend={(content) => act("messages", { content })}
            onPrescribe={(items, notes) => act("prescribe", { items, notes })}
            onComplete={(clinicianPathway, clinicianNotes) =>
              act("complete", { clinicianPathway, clinicianNotes })
            }
          />
        )}
      </div>

      {/* mobile queue */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-2 lg:hidden">
        <select
          value={activeId ?? ""}
          onChange={(e) => setActiveId(e.target.value || null)}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        >
          <option value="">Select a consultation…</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              [{r.pathway}] {r.chiefComplaint} — {r.patientName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- case view */

function CaseView({
  detail,
  verified,
  busy,
  error,
  onAccept,
  onSend,
  onPrescribe,
  onComplete,
}: {
  detail: CaseDetail;
  verified: boolean;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onSend: (content: string) => Promise<boolean | undefined>;
  onPrescribe: (items: Item[], notes: string) => Promise<boolean | undefined>;
  onComplete: (pathway: string, notes: string) => Promise<boolean | undefined>;
}) {
  const { consultation, assessment, patient } = detail;
  const [showConversation, setShowConversation] = useState(false);
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<Item[]>([{ ...EMPTY_ITEM }]);
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [showPrescribe, setShowPrescribe] = useState(false);
  const [finalPathway, setFinalPathway] = useState(assessment?.finalPathway ?? "YELLOW");
  const [completionNotes, setCompletionNotes] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFinalPathway(assessment?.finalPathway ?? "YELLOW");
  }, [assessment?.finalPathway]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail.messages]);

  const canAct = verified && consultation.mine && consultation.state !== "COMPLETED";
  const v = assessment?.verification;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-24 lg:p-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {assessment?.chiefComplaint || "Consultation"}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {patient?.name}
            {patient?.dateOfBirth ? ` · ${patient.dateOfBirth}` : ""} ·{" "}
            {consultation.state.replace("_", " ").toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {assessment && <PathwayBadge pathway={assessment.finalPathway} full />}
          {consultation.state === "QUEUED" && verified && (
            <button
              onClick={onAccept}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-ink disabled:opacity-60"
            >
              Accept case
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* the safety layer's work — the thing a clinician most needs to see */}
      {v?.escalated && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert className="h-4 w-4" />
            Safety rules overrode the model
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-900">
            The triage model returned{" "}
            <strong>{PATHWAY_META[v.escalatedFrom ?? ""]?.label ?? v.escalatedFrom}</strong>. The
            deterministic red-flag layer raised it to{" "}
            <strong>{PATHWAY_META[assessment!.finalPathway]?.label}</strong>.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {v.rulesFired.map((r) => (
              <li key={r.id} className="text-xs text-amber-900">
                <span className="font-semibold">{r.label}</span>
                {r.evidence && <span className="opacity-80"> — “{r.evidence}”</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {v && !v.escalated && v.rulesFired.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <span className="font-medium">Red-flag rules fired and agreed with the model:</span>
          <ul className="mt-1.5 space-y-1 text-xs text-muted">
            {v.rulesFired.map((r) => (
              <li key={r.id}>· {r.label}</li>
            ))}
          </ul>
        </div>
      )}

      {v && v.missingFields.length > 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-ink-2">
          Incomplete intake — never established: {v.missingFields.join(", ")}.
        </p>
      )}

      {/* structured summary */}
      {assessment && (
        <Card>
          <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
            Patient summary
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{assessment.summary}</p>

          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Duration" value={assessment.duration} />
            <Field label="Severity" value={assessment.severity} />
            <Field label="Reported symptoms" list={assessment.symptoms} />
            <Field label="Red flags reported" list={assessment.redFlags} tone="danger" />
            <Field label="Allergies" list={assessment.allergies} tone="danger" />
            <Field label="Current medications" list={assessment.medications} />
            <Field label="Relevant history" list={assessment.history} />
          </dl>

          {assessment.telemetry?.latencyMs ? (
            <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
              Assessment produced in {(assessment.telemetry.latencyMs / 1000).toFixed(1)}s
              {assessment.telemetry.costUsd
                ? ` · $${assessment.telemetry.costUsd.toFixed(4)}`
                : ""}
              {assessment.telemetry.model ? ` · ${assessment.telemetry.model}` : ""}
            </p>
          ) : null}
        </Card>
      )}

      {/* uploads */}
      {detail.attachments.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
            Patient uploads
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {detail.attachments.map((a) => (
              <div key={a.id} className="rounded-xl border border-line p-3">
                {a.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/attachments/${a.id}`}
                    alt={a.filename}
                    className="mb-2 max-h-48 w-full rounded-lg object-cover"
                  />
                ) : (
                  <a
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-brand-ink underline"
                  >
                    <FileText className="h-4 w-4" />
                    Open {a.filename}
                  </a>
                )}
                <div className="text-[11px] font-medium">{a.filename}</div>
                {a.extraction?.legible === false && (
                  <p className="mt-1 text-[11px] text-amber-700">{a.extraction.caveat}</p>
                )}
                {a.extraction?.findings?.length ? (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted">
                    {a.extraction.findings.map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                ) : null}
                {a.extraction?.values?.length ? (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted">
                    {a.extraction.values.map((val) => (
                      <li key={val.label}>
                        · {val.label}: <span className="font-medium">{val.value}</span>
                        {val.flag && val.flag.toLowerCase() !== "normal" ? ` (${val.flag})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-[10px] text-muted italic">
                  Machine reading — verify against the original.
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* AI conversation */}
      <Card padded={false}>
        <button
          onClick={() => setShowConversation((v) => !v)}
          aria-expanded={showConversation}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="text-sm font-semibold tracking-wide text-muted uppercase">
            Full AI conversation ({detail.aiConversation.length})
          </span>
          <ChevronDown
            className={clsx("h-4 w-4 text-muted transition", showConversation && "rotate-180")}
          />
        </button>
        {showConversation && (
          <div className="max-h-96 space-y-2 overflow-y-auto border-t border-line px-5 py-4">
            {detail.aiConversation.map((m) => (
              <div
                key={m.id}
                className={clsx("flex", m.role === "PATIENT" ? "justify-end" : "justify-start")}
              >
                <div
                  className={clsx(
                    "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                    m.role === "PATIENT"
                      ? "bg-brand-soft text-ink"
                      : m.role === "SYSTEM"
                        ? "bg-amber-50 text-amber-900"
                        : "bg-slate-100 text-ink-2",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* consultation thread */}
      {consultation.state !== "QUEUED" && (
        <Card padded={false}>
          <h3 className="border-b border-line px-5 py-3.5 text-sm font-semibold tracking-wide text-muted uppercase">
            Message the patient
          </h3>
          <div ref={threadRef} className="max-h-72 space-y-2 overflow-y-auto px-5 py-4">
            {detail.messages.length === 0 && (
              <p className="py-4 text-center text-xs text-muted">
                No messages yet. The patient can see anything you send here.
              </p>
            )}
            {detail.messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "flex",
                  m.kind === "SYSTEM_EVENT"
                    ? "justify-center"
                    : m.role === "CLINICIAN"
                      ? "justify-end"
                      : "justify-start",
                )}
              >
                <div
                  className={clsx(
                    "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                    m.kind === "SYSTEM_EVENT"
                      ? "bg-amber-50 text-center text-xs text-amber-900"
                      : m.role === "CLINICIAN"
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-ink-2",
                  )}
                >
                  {m.content}
                  <div
                    className={clsx(
                      "mt-1 text-[10px]",
                      m.role === "CLINICIAN" ? "text-white/70" : "text-muted",
                    )}
                  >
                    {clockTime(m.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {canAct && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                const okay = await onSend(draft);
                if (okay) setDraft("");
              }}
              className="flex gap-2 border-t border-line px-5 py-3"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write to the patient…"
                className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
        </Card>
      )}

      {/* prescription */}
      {detail.prescription ? (
        <Card>
          <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
            Prescription issued
          </h3>
          <ul className="mt-3 space-y-2">
            {detail.prescription.items.map((i, idx) => (
              <li key={idx} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="font-medium">{i.name}</span> — {i.dose}, {i.frequency}, {i.duration}
              </li>
            ))}
          </ul>
          {detail.prescription.notes && (
            <p className="mt-3 text-sm text-muted">{detail.prescription.notes}</p>
          )}
        </Card>
      ) : (
        canAct && (
          <Card>
            <button
              onClick={() => setShowPrescribe((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-semibold tracking-wide text-muted uppercase">
                Issue a prescription
              </span>
              <ChevronDown className={clsx("h-4 w-4 text-muted transition", showPrescribe && "rotate-180")} />
            </button>

            {showPrescribe && (
              <div className="mt-4 space-y-3">
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted">
                  Nothing here is pre-filled by the AI. A prescription exists only because
                  you typed it.
                  {detail.assessment?.allergies.length ? (
                    <span className="mt-1 block font-medium text-red-700">
                      Patient reported allergies: {detail.assessment.allergies.join(", ")}
                    </span>
                  ) : null}
                </p>

                {items.map((item, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                    {(["name", "dose", "frequency", "duration"] as const).map((field) => (
                      <input
                        key={field}
                        value={item[field]}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, [field]: e.target.value } : it,
                            ),
                          )
                        }
                        placeholder={
                          field === "name"
                            ? "Medication"
                            : field === "dose"
                              ? "500 mg"
                              : field === "frequency"
                                ? "Twice daily"
                                : "5 days"
                        }
                        className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                      aria-label="Remove item"
                      className="rounded-lg p-2 text-muted hover:bg-slate-100 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add another medication
                </button>

                <textarea
                  value={prescriptionNotes}
                  onChange={(e) => setPrescriptionNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes for the patient and pharmacy (optional)"
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                />

                <button
                  onClick={async () => {
                    const okay = await onPrescribe(
                      items.filter((i) => i.name.trim()),
                      prescriptionNotes,
                    );
                    if (okay) {
                      setShowPrescribe(false);
                      setItems([{ ...EMPTY_ITEM }]);
                      setPrescriptionNotes("");
                    }
                  }}
                  disabled={busy || !items.some((i) => i.name.trim())}
                  className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Issue prescription
                </button>
              </div>
            )}
          </Card>
        )
      )}

      {/* completion */}
      {consultation.state === "COMPLETED" ? (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Completed — your pathway: {PATHWAY_META[consultation.clinicianPathway ?? ""]?.label}
          </div>
          {consultation.clinicianNotes && (
            <p className="mt-2 text-sm text-ink-2">{consultation.clinicianNotes}</p>
          )}
        </Card>
      ) : (
        canAct && (
          <Card>
            <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
              Complete consultation
            </h3>
            <p className="mt-1.5 text-xs text-muted">
              Confirm the pathway or overrule it. Disagreements are recorded — they are the
              signal for whether the triage layer is drifting.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(PATHWAY_META).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setFinalPathway(key)}
                  className={clsx(
                    "rounded-lg border px-3 py-2 text-xs font-medium transition",
                    finalPathway === key
                      ? `${meta.bg} ${meta.text} ${meta.border} ring-1 ring-current/20`
                      : "border-line text-muted hover:border-slate-300",
                  )}
                >
                  {meta.label}
                  {assessment?.finalPathway === key && (
                    <span className="ml-1.5 text-[10px] opacity-70">(AI)</span>
                  )}
                </button>
              ))}
            </div>

            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              placeholder="What did you conclude, and what should the patient do?"
              className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            />

            <button
              onClick={() => onComplete(finalPathway, completionNotes)}
              disabled={busy || !completionNotes.trim()}
              className="mt-3 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Complete consultation
            </button>
          </Card>
        )
      )}
    </div>
  );
}

function Field({
  label,
  value,
  list,
  tone,
}: {
  label: string;
  value?: string;
  list?: string[];
  tone?: "danger";
}) {
  const empty = list ? list.length === 0 : !value || value === "unknown";
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd
        className={clsx(
          "mt-0.5 text-sm",
          empty ? "text-slate-400 italic" : tone === "danger" ? "text-red-700" : "text-ink-2",
        )}
      >
        {empty ? "not established" : list ? list.join(", ") : value}
      </dd>
    </div>
  );
}

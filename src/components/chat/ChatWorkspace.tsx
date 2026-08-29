"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Plus,
  Send,
  Paperclip,
  ImageIcon,
  FileText,
  ShieldAlert,
  Stethoscope,
  Check,
} from "lucide-react";
import { useSocketEvent } from "@/components/SocketProvider";
import { PathwayBadge, PATHWAY_META, AiDisclaimer, Spinner, timeAgo, clockTime, EmptyState } from "@/components/ui";

/* ------------------------------------------------------------------ types */

interface ConversationRow {
  id: string;
  title: string;
  state: string;
  pathway: string | null;
  lastMessage: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: "PATIENT" | "AI" | "CLINICIAN" | "PHARMACY" | "SYSTEM";
  content: string;
  kind: string;
  meta: Record<string, unknown> | null;
  attachmentIds: string[];
  createdAt: string;
}

interface AgentStep {
  step: string;
  note?: string;
  model: string;
}

/** Human-readable labels for the agent steps streamed over the socket. */
const STEP_LABEL: Record<string, string> = {
  conversation: "Working out what to ask next",
  "conversation:invalid": "Retrying — response was malformed",
  vision: "Reading your upload",
  "vision:invalid": "Retrying — could not parse the reading",
  extraction: "Structuring what you've told me",
  "extraction:invalid": "Retrying — structuring failed",
  triage: "Assessing which care you need",
  "triage:invalid": "Retrying — triage response was malformed",
  "verification:clear": "Red-flag checks passed",
  "verification:confirm": "Red-flag checks agree",
  "verification:escalate": "Red-flag rules escalated this case",
  "verification:incomplete": "Noting what's still missing",
  "assessment-lock": "Finalising your assessment",
};

/* ------------------------------------------------------------- component */

export function ChatWorkspace({ initial }: { initial: ConversationRow[] }) {
  const [conversations, setConversations] = useState<ConversationRow[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assessment, setAssessment] = useState<Record<string, unknown> | null>(null);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadKind = useRef<"PHOTO" | "LAB_RESULT">("PHOTO");

  const active = conversations.find((c) => c.id === activeId) ?? null;

  /* ------------------------------------------------------------- loading */

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load that conversation");
      setMessages(data.messages);
      setAssessment(data.assessment);
      setConsultationId(data.consultation?.id ?? null);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                title: data.conversation.title,
                state: data.conversation.state,
                pathway: data.assessment?.finalPathway ?? c.pathway,
              }
            : c,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that conversation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) loadConversation(activeId);
  }, [activeId, loadConversation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, steps]);

  // Mirror the latest message into the sidebar row, whichever path delivered it
  // (send, upload, or socket) — otherwise an active chat reads "No messages yet".
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    const last = messages[messages.length - 1];
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, lastMessage: String(last.content).slice(0, 90), updatedAt: last.createdAt }
          : c,
      ),
    );
  }, [messages, activeId]);

  /* ------------------------------------------------------------ realtime */

  useSocketEvent<{ conversationId: string; message: ChatMessage }>("message", (payload) => {
    if (payload.conversationId !== activeId) return;
    setMessages((prev) =>
      prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message],
    );
  });

  useSocketEvent<AgentStep & { conversationId: string }>("agent-step", (payload) => {
    if (payload.conversationId !== activeId) return;
    setSteps((prev) => [...prev.slice(-3), payload]);
  });

  useSocketEvent<{ conversationId: string; pathway: string }>(
    "conversation-state",
    (payload) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === payload.conversationId
            ? { ...c, state: "ASSESSMENT_COMPLETE", pathway: payload.pathway }
            : c,
        ),
      );
      if (payload.conversationId === activeId) loadConversation(payload.conversationId);
    },
  );

  /* ------------------------------------------------------------- actions */

  async function startConversation() {
    setError(null);
    const res = await fetch("/api/conversations", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Could not start a chat");

    setConversations((prev) => [
      {
        id: data.conversation.id,
        title: data.conversation.title,
        state: data.conversation.state,
        pathway: null,
        lastMessage: "",
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setActiveId(data.conversation.id);
    setMessages(data.messages);
    setAssessment(null);
    setConsultationId(null);
    setShowList(false);
  }

  async function send(text: string) {
    if (!activeId || !text.trim() || thinking) return;
    setDraft("");
    setThinking(true);
    setSteps([]);
    setError(null);

    // Optimistic echo — the socket delivers the canonical copy moments later
    // and the id check above de-duplicates it.
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "PATIENT",
      content: text,
      kind: "TEXT",
      meta: null,
      attachmentIds: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setError(data.error ?? "Message could not be sent");
        return;
      }
      setMessages((prev) => {
        const withoutLocal = prev.filter((m) => m.id !== optimistic.id);
        const merged = [...withoutLocal, data.message, ...data.replies];
        const seen = new Set<string>();
        return merged.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
      });
      if (data.assessmentId) await loadConversation(activeId);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setThinking(false);
      setSteps([]);
    }
  }

  async function upload(file: File) {
    if (!activeId) return;
    setThinking(true);
    setSteps([]);
    setError(null);

    const body = new FormData();
    body.append("file", file);
    body.append("kind", uploadKind.current);

    try {
      const res = await fetch(`/api/conversations/${activeId}/uploads`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setMessages((prev) => {
        const merged = [...prev, data.message, ...data.replies];
        const seen = new Set<string>();
        return merged.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
      });
      await loadConversation(activeId);
    } catch {
      setError("Upload failed.");
    } finally {
      setThinking(false);
      setSteps([]);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function requestClinician() {
    if (!activeId) return;
    setError(null);
    const res = await fetch(`/api/conversations/${activeId}/request-clinician`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Could not request a clinician");
    setConsultationId(data.consultation.id);
    await loadConversation(activeId);
  }

  /* ---------------------------------------------------------------- view */

  return (
    <div className="flex h-full">
      {/* ---- conversation list ---- */}
      <div
        className={clsx(
          "w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-80",
          showList ? "flex" : "hidden",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <h1 className="text-base font-semibold">Health chats</h1>
          <button
            onClick={startConversation}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <EmptyState
              title="No chats yet"
              body="Start a health chat and describe what's going on. It takes a couple of minutes."
              action={
                <button
                  onClick={startConversation}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink"
                >
                  Start a health chat
                </button>
              }
            />
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveId(c.id);
                  setShowList(false);
                }}
                className={clsx(
                  "flex w-full items-start gap-3 border-b border-line/70 px-4 py-3 text-left transition",
                  activeId === c.id ? "bg-brand-soft/40" : "hover:bg-slate-50",
                )}
              >
                <span
                  className={clsx(
                    "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    c.pathway
                      ? `${PATHWAY_META[c.pathway]?.bg} ${PATHWAY_META[c.pathway]?.text}`
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {c.pathway === "RED" ? <ShieldAlert className="h-4 w-4" /> : "AI"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.title}</span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {timeAgo(c.updatedAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {c.lastMessage || "No messages yet"}
                  </span>
                  {c.pathway && (
                    <span className="mt-1.5 block">
                      <PathwayBadge pathway={c.pathway} size="sm" />
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ---- thread ---- */}
      <div className={clsx("flex min-w-0 flex-1 flex-col", showList && "hidden md:flex")}>
        {!active ? (
          <div className="chat-canvas flex h-full items-center justify-center">
            <EmptyState
              title="Select a chat"
              body="Pick a conversation on the left, or start a new one to describe a symptom."
            />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
              <button
                onClick={() => setShowList(true)}
                className="rounded-lg px-2 py-1 text-sm text-brand-ink md:hidden"
              >
                Back
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{active.title}</div>
                <div className="text-[11px] text-muted">
                  {active.state === "ROUTED"
                    ? "Routed to a clinician"
                    : active.state === "ASSESSMENT_COMPLETE"
                      ? "Assessment complete"
                      : "AI health assistant"}
                </div>
              </div>
              {active.pathway && <PathwayBadge pathway={active.pathway} />}
            </header>

            <div ref={scrollRef} className="chat-canvas flex-1 space-y-2.5 overflow-y-auto px-4 py-5">
              {loading && (
                <div className="flex justify-center py-6">
                  <Spinner className="h-5 w-5 text-muted" />
                </div>
              )}

              {messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}

              {thinking && <ThinkingRow steps={steps} />}
            </div>

            {/* assessment actions */}
            {assessment && !consultationId && (
              <div className="border-t border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* The disclaimer already sits inside the assessment card above. */}
                  <p className="max-w-md text-sm text-ink-2">
                    A registered clinician can review this and message you here.
                  </p>
                  <button
                    onClick={requestClinician}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-ink"
                  >
                    <Stethoscope className="h-4 w-4" />
                    {String(assessment.finalPathway) === "GREEN"
                      ? "Request a clinician anyway"
                      : "Request a clinician"}
                  </button>
                </div>
              </div>
            )}

            {consultationId && (
              <div className="flex items-center gap-2 border-t border-line bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <Check className="h-4 w-4 shrink-0" />
                <span>
                  Sent to the clinician queue. Follow it in{" "}
                  <a href="/app/care" className="font-semibold underline">
                    My care
                  </a>
                  .
                </span>
              </div>
            )}

            {error && (
              <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {/* composer */}
            {active.state !== "ROUTED" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
                className="flex items-end gap-2 border-t border-line bg-surface px-3 py-3"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                  }}
                />
                <button
                  type="button"
                  title="Upload a photo of the affected area"
                  aria-label="Upload a photo"
                  disabled={thinking}
                  onClick={() => {
                    uploadKind.current = "PHOTO";
                    fileRef.current?.click();
                  }}
                  className="rounded-lg p-2.5 text-muted transition hover:bg-slate-100 hover:text-ink disabled:opacity-50"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  title="Upload a test or lab result"
                  aria-label="Upload a test result"
                  disabled={thinking}
                  onClick={() => {
                    uploadKind.current = "LAB_RESULT";
                    fileRef.current?.click();
                  }}
                  className="rounded-lg p-2.5 text-muted transition hover:bg-slate-100 hover:text-ink disabled:opacity-50"
                >
                  <Paperclip className="h-5 w-5" />
                </button>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(draft);
                    }
                  }}
                  rows={1}
                  placeholder="Describe what you're experiencing…"
                  disabled={thinking}
                  className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={thinking || !draft.trim()}
                  aria-label="Send"
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand-ink disabled:opacity-40"
                >
                  {thinking ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function ThinkingRow({ steps }: { steps: AgentStep[] }) {
  const latest = steps[steps.length - 1];
  const label = latest ? (STEP_LABEL[latest.step] ?? latest.step) : "Thinking";

  return (
    <div className="fade-up flex justify-start">
      <div className="bubble bubble-in flex items-center gap-2.5">
        <span className="flex gap-1" aria-hidden>
          <span className="dot-flash h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span className="dot-flash h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span className="dot-flash h-1.5 w-1.5 rounded-full bg-slate-400" />
        </span>
        <span className="text-xs text-muted">{label}…</span>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.kind === "ASSESSMENT_CARD") return <AssessmentCard message={message} />;

  if (message.kind === "SYSTEM_EVENT") {
    return (
      <div className="fade-up flex justify-center">
        <div className="bubble bubble-system text-center text-ink-2">{message.content}</div>
      </div>
    );
  }

  const mine = message.role === "PATIENT";
  const meta = (message.meta ?? {}) as Record<string, unknown>;
  const options = Array.isArray(meta.options) ? (meta.options as string[]) : [];

  return (
    <div className={clsx("fade-up flex", mine ? "justify-end" : "justify-start")}>
      <div className={clsx("bubble", mine ? "bubble-out" : "bubble-in")}>
        {message.kind === "ATTACHMENT" && (
          <AttachmentBlock message={message} meta={meta} />
        )}

        {message.content}

        {options.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <span
                key={o}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink-2"
              >
                {o}
              </span>
            ))}
          </div>
        )}

        <div className={clsx("mt-1 text-[10px]", mine ? "text-emerald-800/60" : "text-muted")}>
          {clockTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function AttachmentBlock({
  message,
  meta,
}: {
  message: ChatMessage;
  meta: Record<string, unknown>;
}) {
  const id = message.attachmentIds[0];
  const mime = String(meta.mimeType ?? "");
  const findings = Array.isArray(meta.findings) ? (meta.findings as string[]) : [];
  const values = Array.isArray(meta.values)
    ? (meta.values as { label: string; value: string; flag?: string }[])
    : [];
  const redFlags = Array.isArray(meta.redFlags) ? (meta.redFlags as string[]) : [];
  const legible = meta.legible !== false;

  return (
    <div className="mb-2 space-y-2">
      {id && mime.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/attachments/${id}`}
          alt={String(meta.filename ?? "Uploaded image")}
          className="max-h-64 w-full rounded-lg object-cover"
        />
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-ink-2">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{String(meta.filename ?? "Attachment")}</span>
        </div>
      )}

      {!legible && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          {String(meta.caveat ?? "This file could not be read automatically.")}
        </p>
      )}

      {(findings.length > 0 || values.length > 0) && (
        <div className="rounded-md bg-slate-50 px-2.5 py-2 text-[11px] text-ink-2">
          <div className="mb-1 font-semibold tracking-wide text-muted uppercase">Read from this file</div>
          <ul className="space-y-0.5">
            {findings.slice(0, 4).map((f) => (
              <li key={f}>· {f}</li>
            ))}
            {values.slice(0, 6).map((v) => (
              <li key={v.label}>
                · {v.label}: <span className="font-medium">{v.value}</span>
                {v.flag && v.flag.toLowerCase() !== "normal" && (
                  <span className="ml-1 text-amber-700">({v.flag})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {redFlags.length > 0 && (
        <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
          Flagged: {redFlags.join("; ")}
        </p>
      )}
    </div>
  );
}

function AssessmentCard({ message }: { message: ChatMessage }) {
  const meta = (message.meta ?? {}) as Record<string, unknown>;
  const pathway = String(meta.pathway ?? "YELLOW");
  const palette = PATHWAY_META[pathway] ?? PATHWAY_META.YELLOW;
  const rules = Array.isArray(meta.rulesFired)
    ? (meta.rulesFired as { id: string; label: string; evidence: string }[])
    : [];

  return (
    <div className="fade-up flex justify-center py-1">
      <div
        className={clsx(
          "w-full max-w-lg rounded-2xl border bg-surface p-4 shadow-sm",
          palette.border,
          pathway === "RED" && "pulse-once",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            Assessment complete
          </span>
          <PathwayBadge pathway={pathway} full />
        </div>

        <h3 className={clsx("mt-2 text-base font-semibold", palette.text)}>
          {String(meta.title ?? "Care pathway")}
        </h3>

        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{message.content}</p>

        {Boolean(meta.escalated) && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
              <ShieldAlert className="h-3.5 w-3.5" />
              Safety rules raised this
            </div>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              The assistant initially suggested{" "}
              <strong>{PATHWAY_META[String(meta.escalatedFrom)]?.label ?? "a lower pathway"}</strong>.
              A red-flag check disagreed and raised it: {String(meta.escalationReason ?? "")}.
            </p>
          </div>
        )}

        {rules.length > 0 && (
          <ul className="mt-3 space-y-1">
            {rules.map((r) => (
              <li key={r.id} className="flex gap-2 text-xs text-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                <span>
                  <span className="font-medium text-ink-2">{r.label}</span>
                  {r.evidence && <span className="text-muted"> — “{r.evidence}”</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <AiDisclaimer className="mt-3 border-t border-line pt-3" />
      </div>
    </div>
  );
}

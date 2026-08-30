"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ScrollText } from "lucide-react";
import { Card, EmptyState, Spinner, timeAgo } from "@/components/ui";

interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  actor: string;
  actorRole: string;
  prevState: string | null;
  newState: string | null;
  createdAt: string;
}

export function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    const json = await res.json();
    if (res.ok) setEntries(json.audit ?? []);
    else setError(json.error ?? "Could not load audit log");
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!entries) {
    return (
      <div className="flex h-64 items-center justify-center">
        {error ? <p className="text-sm text-red-600">{error}</p> : <Spinner className="h-8 w-8 text-muted" />}
      </div>
    );
  }

  const filtered = search
    ? entries.filter(
        (a) =>
          a.action.toLowerCase().includes(search.toLowerCase()) ||
          a.actor.toLowerCase().includes(search.toLowerCase()) ||
          a.resource.toLowerCase().includes(search.toLowerCase()),
      )
    : entries;

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search actions, actors…"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />

      <Card padded={false}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> Audit log
          </h2>
          <span className="text-xs text-muted">{filtered.length} entries</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-8 w-8" />}
            title="Nothing recorded yet"
            body="Administrative and clinical actions will appear here as they happen."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/60 bg-surface-2">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted">Action</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted">Actor</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted hidden sm:table-cell">State change</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-line/60 last:border-0 hover:bg-slate-50 transition">
                  <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                    <span
                      className={clsx(
                        a.action.includes("escalat") || a.action.includes("revised")
                          ? "text-amber-700"
                          : a.action.includes("prescription")
                            ? "text-violet-700"
                            : a.action.includes("verified") || a.action.includes("created")
                              ? "text-emerald-700"
                              : "text-ink-2",
                      )}
                    >
                      {a.action}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted">
                    {a.actor}
                    <span className="ml-1 opacity-60">({a.actorRole.toLowerCase()})</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted hidden sm:table-cell">
                    {a.prevState || a.newState ? (
                      <span className="font-mono">{a.prevState ?? "—"} → {a.newState ?? "—"}</span>
                    ) : (
                      a.resource
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-xs whitespace-nowrap text-muted">
                    {timeAgo(a.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

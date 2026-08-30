"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  MessagesSquare,
  HeartPulse,
  ClipboardList,
  Pill,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Users,
  ScrollText,
} from "lucide-react";
import { useSocket } from "./SocketProvider";
import type { Role } from "@/lib/models";

const NAV: Record<Role, { href: string; label: string; icon: typeof MessagesSquare; exact?: boolean }[]> = {
  PATIENT: [
    { href: "/app/chat", label: "Health chats", icon: MessagesSquare },
    { href: "/app/care", label: "My care", icon: HeartPulse },
  ],
  CLINICIAN: [{ href: "/app/queue", label: "Consultation queue", icon: ClipboardList }],
  PHARMACY: [{ href: "/app/pharmacy", label: "Fulfilment", icon: Pill }],
  ADMIN: [
    { href: "/app/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/app/admin/professionals", label: "Professionals", icon: Users },
    { href: "/app/admin/audit", label: "Audit Trail", icon: ScrollText },
  ],
};

export function AppNav({
  role,
  name,
  verified,
}: {
  role: Role;
  name: string;
  verified: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { connected } = useSocket();
  const [open, setOpen] = useState(false);

  const items = NAV[role] ?? [];

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = (
    <nav className="space-y-1">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + "/"));
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-brand-soft/70 text-brand-ink"
                : "text-ink-2 hover:bg-slate-100 hover:text-ink",
            )}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const body = (
    <>
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-base font-bold text-white">
          C
        </span>
        <span className="text-base font-semibold tracking-tight">CareLoop</span>
      </div>

      <div className="mt-7 flex-1">{links}</div>

      <div className="space-y-3 border-t border-line pt-4">
        {!verified && role !== "PATIENT" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            Awaiting administrator verification. You can look around, but you
            can&rsquo;t act on patients yet.
          </p>
        )}

        <div className="flex items-center gap-2 px-1 text-xs text-muted">
          <span
            className={clsx(
              "h-2 w-2 rounded-full",
              connected ? "bg-emerald-500" : "bg-slate-300",
            )}
            aria-hidden
          />
          {connected ? "Live" : "Reconnecting…"}
        </div>

        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="text-[11px] text-muted capitalize">{role.toLowerCase()}</div>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-2 text-muted transition hover:bg-slate-100 hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* mobile bar */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-bold text-white">
            C
          </span>
          <span className="text-sm font-semibold">CareLoop</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded-lg p-2 text-ink-2 hover:bg-slate-100"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-b border-line bg-surface p-4 lg:hidden">
          {body}
        </div>
      )}

      {/* desktop rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        {body}
      </aside>
    </>
  );
}

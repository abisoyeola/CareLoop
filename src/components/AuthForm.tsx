"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Spinner } from "./ui";

type Role = "PATIENT" | "CLINICIAN" | "PHARMACY";

const ROLES: { value: Role; label: string; blurb: string }[] = [
  { value: "PATIENT", label: "Patient", blurb: "Describe a symptom and get routed" },
  { value: "CLINICIAN", label: "Clinician", blurb: "Review cases and prescribe" },
  { value: "PHARMACY", label: "Pharmacy", blurb: "Fulfil prescriptions" },
];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("PATIENT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { ...payload, role } : payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          data.issues?.length
            ? data.issues.map((i: { message: string }) => i.message).join(". ")
            : (data.error ?? "Something went wrong"),
        );
        setBusy(false);
        return;
      }

      router.push("/app");
      router.refresh();
    } catch {
      setError("Could not reach the server. Is it running?");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none transition " +
    "placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "register" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-2">I am a</label>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                aria-pressed={role === r.value}
                className={
                  "rounded-lg border px-2 py-2.5 text-left transition " +
                  (role === r.value
                    ? "border-brand bg-brand-soft/60 ring-1 ring-brand/30"
                    : "border-line bg-white hover:border-slate-300")
                }
              >
                <div className="text-sm font-medium text-ink">{r.label}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-muted">{r.blurb}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "register" && (
        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-ink-2">
            Full name
          </label>
          <input id="name" name="name" required minLength={2} className={field} placeholder="Ada Nwosu" />
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-ink-2">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-2">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          className={field}
          placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
        />
      </div>

      {mode === "register" && role === "CLINICIAN" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="licenseNo" className="mb-1.5 block text-xs font-medium text-ink-2">
              Licence number
            </label>
            <input id="licenseNo" name="licenseNo" required className={field} placeholder="MDCN/12345" />
          </div>
          <div>
            <label htmlFor="specialty" className="mb-1.5 block text-xs font-medium text-ink-2">
              Specialty
            </label>
            <input id="specialty" name="specialty" className={field} placeholder="General Practice" />
          </div>
        </div>
      )}

      {mode === "register" && role === "PHARMACY" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="pharmacyName" className="mb-1.5 block text-xs font-medium text-ink-2">
              Pharmacy name
            </label>
            <input id="pharmacyName" name="pharmacyName" required className={field} placeholder="Grace Pharmacy" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="address" className="mb-1.5 block text-xs font-medium text-ink-2">
                Address
              </label>
              <input id="address" name="address" required className={field} placeholder="12 Awolowo Rd" />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-xs font-medium text-ink-2">
                Phone
              </label>
              <input id="phone" name="phone" className={field} placeholder="+234…" />
            </div>
          </div>
        </div>
      )}

      {mode === "register" && role !== "PATIENT" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          {role === "CLINICIAN" ? "Clinician" : "Pharmacy"} accounts are reviewed by an
          administrator before they can work with patients. You can sign in immediately
          and will see your verification status.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-ink disabled:opacity-60"
      >
        {busy && <Spinner className="h-4 w-4" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link href="/register" className="font-medium text-brand-ink hover:underline">
              Create one
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login" className="font-medium text-brand-ink hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

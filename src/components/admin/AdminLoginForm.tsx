"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";

export function AdminLoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const field =
    "w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm text-white " +
    "placeholder:text-slate-500 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = { email: form.get("email"), password: form.get("password") };

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
        setBusy(false);
        return;
      }

      if (data.user?.role !== "ADMIN") {
        // Sign them out again and show a relevant error
        await fetch("/api/auth/logout", { method: "POST" });
        setError("This portal is for administrator accounts only.");
        setBusy(false);
        return;
      }

      router.push("/app/admin");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="admin-email" className="mb-1.5 block text-xs font-medium text-slate-400">
          Admin email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
          placeholder="micro1@careloop.com"
        />
      </div>

      <div>
        <label htmlFor="admin-password" className="mb-1.5 block text-xs font-medium text-slate-400">
          Password
        </label>
        <div className="relative">
          <input
            id="admin-password"
            name="password"
            type={showPwd ? "text" : "password"}
            required
            autoComplete="current-password"
            className={field + " pr-11"}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-800/60 bg-red-950/60 px-4 py-2.5 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        id="admin-login-btn"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-60 mt-2"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {busy ? "Signing in…" : "Sign in as Administrator"}
      </button>
    </form>
  );
}

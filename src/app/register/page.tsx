import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { BrandPanel } from "@/components/BrandPanel";

export const metadata = { title: "Create an account — CareLoop" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getSession()) redirect("/app");

  return (
    <main className="flex min-h-screen">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
              C
            </span>
            <span className="font-semibold">CareLoop</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 mb-7 text-sm text-muted">
            Takes about a minute. No card, no clinic visit.
          </p>
          <AuthForm mode="register" />
        </div>
      </div>
    </main>
  );
}

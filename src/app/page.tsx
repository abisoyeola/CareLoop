import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldAlert, Split, UserCheck } from "lucide-react";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    icon: Split,
    title: "It asks the second question",
    body: "“I've got a really bad headache” and “I've got a really bad headache” are the same sentence — one is tension, one is a bleed. The difference only appears if something asks about onset, vomiting and neck stiffness. A single-prompt chatbot answers the sentence. CareLoop interviews the patient.",
  },
  {
    icon: ShieldAlert,
    title: "Rules can escalate, never downgrade",
    body: "After the model picks a pathway, a deterministic red-flag layer runs over the transcript. It can raise the urgency and it is structurally incapable of lowering it. When it overrides the model, the override and its evidence are recorded on the case.",
  },
  {
    icon: UserCheck,
    title: "A human holds the pen",
    body: "The AI routes. It cannot diagnose, cannot prescribe, and cannot authorise a pharmacy to dispense. A verified clinician reviews the summary, confirms or overrules the pathway, and is the only thing that can create a prescription.",
  },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-base font-bold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight">CareLoop</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-slate-100"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-ink"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-12 pb-20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          AI care navigation with human clinical review
        </p>

        <h1 className="max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Most people can&rsquo;t tell whether their symptom is urgent.
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
          So they wait, or they go to A&amp;E for a sore throat. CareLoop runs the intake
          conversation a triage nurse would run, checks the answers against red-flag
          rules that can only ever escalate, and hands a clinician a case they can act
          on in seconds instead of rebuilding from scratch.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-ink"
          >
            Start a health chat
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:border-slate-300"
          >
            I already have an account
          </Link>
        </div>

        <div className="mt-20 grid gap-5 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 max-w-3xl border-t border-line pt-6 text-xs leading-relaxed text-muted">
          CareLoop is a demonstration system built for the micro1 Agentic Workflows
          Hackathon. It uses synthetic data only. It is not a medical device, its triage
          rules have not been clinically validated, and it must not be used for real
          medical decisions. If you have a medical emergency, contact your local
          emergency services.
        </p>
      </section>
    </main>
  );
}

import { ShieldCheck, Stethoscope, MessageSquareText, Pill } from "lucide-react";

const STEPS = [
  { icon: MessageSquareText, label: "Structured intake", body: "Adaptive questions, not a form." },
  { icon: ShieldCheck, label: "Verified triage", body: "Rules that can escalate, never downgrade." },
  { icon: Stethoscope, label: "Human review", body: "A clinician decides. Always." },
  { icon: Pill, label: "Verified pharmacy", body: "Fulfilment you can track." },
];

/** The marketing rail beside the auth forms. Hidden on small screens. */
export function BrandPanel() {
  return (
    <aside className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden bg-[#0b3b38] px-12 py-14 text-white lg:flex">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-300/10 blur-3xl"
      />

      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/95 text-base font-bold text-[#0b3b38]">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight">CareLoop</span>
        </div>

        <h2 className="mt-14 max-w-md text-3xl leading-tight font-semibold tracking-tight">
          Turn a patient&rsquo;s first message into a coordinated path to care.
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-teal-100/80">
          Most people don&rsquo;t know whether what they&rsquo;re feeling is urgent. CareLoop
          asks the questions a triage nurse would ask, checks the answers against
          red-flag rules, and hands a clinician a case they can act on immediately.
        </p>
      </div>

      <ul className="relative mt-12 space-y-5">
        {STEPS.map(({ icon: Icon, label, body }) => (
          <li key={label} className="flex gap-3.5">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
              <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-teal-100/70">{body}</div>
            </div>
          </li>
        ))}
      </ul>

      <p className="relative mt-12 text-xs leading-relaxed text-teal-100/50">
        CareLoop is a care-navigation tool. It does not diagnose, and it cannot
        authorise medication on its own — a registered clinician reviews every case
        that needs one.
      </p>
    </aside>
  );
}

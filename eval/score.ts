import { Pathway, PATHWAY_RANK } from "../src/lib/models";

/**
 * Scoring for the baseline/agent comparison.
 *
 * Care-pathway accuracy is the headline number, but it is not the number that
 * matters. Routing a sore throat to a clinician when self-care would have done
 * costs a few minutes of clinician time. Routing a resolving stroke to self-care
 * costs a brain. Those two are both "one wrong answer" to an accuracy metric,
 * so `criticalMissRate` is reported alongside and is the metric the design
 * decisions in this project were actually optimised against.
 */

export interface CaseExpectation {
  pathway: Pathway;
  mustCapture: string[];
}

export interface CaseOutcome {
  caseId: string;
  category: string;
  arm: string;
  expected: Pathway;
  predicted: Pathway;
  correct: boolean;
  /** Predicted less urgent than expected — the direction that harms people. */
  underTriaged: boolean;
  overTriaged: boolean;
  /** Expected RED, routed anywhere else. */
  criticalMiss: boolean;
  captured: string[];
  missed: string[];
  completeness: number;
  latencyMs: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  modelCalls: number;
  turns?: number;
  error?: string;
}

const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "at", "and", "or", "is", "was",
  "with", "for", "no", "not", "has", "have", "had", "it", "its", "their",
]);

function contentWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * A `mustCapture` phrase counts as captured when most of its content words
 * appear somewhere in the structured output. Exact string matching would
 * punish "38.4" vs "38.4C" and "arm weakness" vs "weakness in the arm" without
 * measuring anything real.
 */
export function captured(phrase: string, haystack: string): boolean {
  const words = contentWords(phrase);
  if (!words.length) return false;
  const hay = haystack.toLowerCase();
  const hits = words.filter((w) => {
    if (hay.includes(w)) return true;
    // tolerate simple plural/verb endings
    const stem = w.replace(/(ing|ed|s)$/, "");
    return stem.length > 3 && hay.includes(stem);
  });
  return hits.length / words.length >= 0.6;
}

export function scoreCase(args: {
  caseId: string;
  category: string;
  arm: string;
  expected: CaseExpectation;
  predicted: Pathway;
  /** Everything the arm produced as structured output, flattened to text. */
  structuredText: string;
  latencyMs: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  modelCalls: number;
  turns?: number;
  error?: string;
}): CaseOutcome {
  const hit: string[] = [];
  const miss: string[] = [];
  for (const phrase of args.expected.mustCapture) {
    (captured(phrase, args.structuredText) ? hit : miss).push(phrase);
  }

  const expRank = PATHWAY_RANK[args.expected.pathway];
  const predRank = PATHWAY_RANK[args.predicted];

  return {
    caseId: args.caseId,
    category: args.category,
    arm: args.arm,
    expected: args.expected.pathway,
    predicted: args.predicted,
    correct: args.predicted === args.expected.pathway,
    underTriaged: predRank < expRank,
    overTriaged: predRank > expRank,
    criticalMiss: args.expected.pathway === "RED" && args.predicted !== "RED",
    captured: hit,
    missed: miss,
    completeness: args.expected.mustCapture.length
      ? hit.length / args.expected.mustCapture.length
      : 1,
    latencyMs: args.latencyMs,
    costUsd: args.costUsd,
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    modelCalls: args.modelCalls,
    turns: args.turns,
    error: args.error,
  };
}

export interface ArmSummary {
  arm: string;
  n: number;
  accuracy: number;
  underTriageRate: number;
  overTriageRate: number;
  criticalMissRate: number;
  redCases: number;
  redCaught: number;
  completeness: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
  avgTurns: number;
  errors: number;
}

export function summarise(arm: string, outcomes: CaseOutcome[]): ArmSummary {
  const n = outcomes.length || 1;
  const red = outcomes.filter((o) => o.expected === "RED");
  const withTurns = outcomes.filter((o) => typeof o.turns === "number");

  return {
    arm,
    n: outcomes.length,
    accuracy: outcomes.filter((o) => o.correct).length / n,
    underTriageRate: outcomes.filter((o) => o.underTriaged).length / n,
    overTriageRate: outcomes.filter((o) => o.overTriaged).length / n,
    criticalMissRate: red.length
      ? red.filter((o) => o.criticalMiss).length / red.length
      : 0,
    redCases: red.length,
    redCaught: red.filter((o) => !o.criticalMiss).length,
    completeness: outcomes.reduce((a, o) => a + o.completeness, 0) / n,
    avgLatencyMs: outcomes.reduce((a, o) => a + o.latencyMs, 0) / n,
    avgCostUsd: outcomes.reduce((a, o) => a + o.costUsd, 0) / n,
    totalCostUsd: outcomes.reduce((a, o) => a + o.costUsd, 0),
    avgTurns: withTurns.length
      ? withTurns.reduce((a, o) => a + (o.turns ?? 0), 0) / withTurns.length
      : 0,
    errors: outcomes.filter((o) => o.error).length,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;

export function renderMarkdown(
  summaries: ArmSummary[],
  outcomes: CaseOutcome[],
  meta: { provider: string; models: string; startedAt: string; note?: string },
): string {
  const lines: string[] = [];

  lines.push("# CareLoop evaluation results", "");
  lines.push(`- **Run started:** ${meta.startedAt}`);
  lines.push(`- **Provider:** ${meta.provider}`);
  lines.push(`- **Models:** ${meta.models}`);
  lines.push(`- **Cases:** ${summaries[0]?.n ?? 0} synthetic cases (\`eval/cases.json\`)`);
  if (meta.note) lines.push(`- **Note:** ${meta.note}`);
  lines.push("");

  lines.push("## Headline comparison", "");
  lines.push(
    "| Metric | " + summaries.map((s) => s.arm).join(" | ") + " |",
    "|---|" + summaries.map(() => "---|").join(""),
  );

  const row = (label: string, fn: (s: ArmSummary) => string) =>
    lines.push(`| ${label} | ` + summaries.map(fn).join(" | ") + " |");

  row("Care-pathway accuracy", (s) => pct(s.accuracy));
  row("**Critical miss rate** (RED routed elsewhere)", (s) => `**${pct(s.criticalMissRate)}**`);
  row("RED cases caught", (s) => `${s.redCaught} / ${s.redCases}`);
  row("Under-triage rate (all cases)", (s) => pct(s.underTriageRate));
  row("Over-triage rate (all cases)", (s) => pct(s.overTriageRate));
  row("Required-info completeness", (s) => pct(s.completeness));
  row("Avg latency per case", (s) => `${(s.avgLatencyMs / 1000).toFixed(1)}s`);
  row("Avg cost per case", (s) => usd(s.avgCostUsd));
  row("Total cost", (s) => usd(s.totalCostUsd));
  row("Avg patient turns", (s) => (s.avgTurns ? s.avgTurns.toFixed(1) : "1.0"));
  row("Errors", (s) => String(s.errors));

  lines.push("", "## Per-case results", "");

  const arms = summaries.map((s) => s.arm);
  lines.push(
    "| Case | Category | Expected | " + arms.join(" | ") + " |",
    "|---|---|---|" + arms.map(() => "---|").join(""),
  );

  const byCase = new Map<string, CaseOutcome[]>();
  for (const o of outcomes) {
    if (!byCase.has(o.caseId)) byCase.set(o.caseId, []);
    byCase.get(o.caseId)!.push(o);
  }

  for (const [caseId, group] of byCase) {
    const first = group[0];
    const cells = arms.map((arm) => {
      const o = group.find((g) => g.arm === arm);
      if (!o) return "—";
      if (o.correct) return `${o.predicted} ✓`;
      if (o.criticalMiss) return `${o.predicted} ✗✗`;
      return `${o.predicted} ✗`;
    });
    lines.push(
      `| \`${caseId}\` | ${first.category} | ${first.expected} | ${cells.join(" | ")} |`,
    );
  }

  lines.push("", "`✓` correct · `✗` wrong · `✗✗` a RED case routed somewhere other than RED.", "");

  const misses = outcomes.filter((o) => o.criticalMiss);
  if (misses.length) {
    lines.push("## Critical misses", "");
    for (const m of misses) {
      lines.push(`- **${m.arm}** on \`${m.caseId}\`: expected RED, returned ${m.predicted}.`);
      if (m.missed.length) lines.push(`  - Never captured: ${m.missed.join(", ")}`);
    }
    lines.push("");
  } else {
    lines.push("## Critical misses", "", "None in any arm on this run.", "");
  }

  return lines.join("\n");
}

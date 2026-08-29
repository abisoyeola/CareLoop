import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runRules, applyFloor } from "../src/agents/verify";
import { Pathway, PATHWAY_RANK } from "../src/lib/models";
import { Extraction } from "../src/agents/schemas";

/**
 * Rule coverage check — `npm run rules:check`.
 *
 * Runs the deterministic layer against each case's fact sheet with no model in
 * the loop, so it measures the safety net on its own. Free, instant, and
 * deterministic, which makes it the right place to catch a rule that has stopped
 * matching what it is supposed to match.
 *
 * Two things it asserts:
 *   1. Every RED case is independently reachable by the rules. If the model
 *      under-triages one of these, something still catches it.
 *   2. No non-RED case is driven to RED by the rules alone. A safety net that
 *      escalates everything has stopped being a safety net.
 */

interface EvalCase {
  id: string;
  category: string;
  opening: string;
  facts: string[];
  expected: { pathway: Pathway; mustCapture: string[] };
}

const EMPTY: Extraction = {
  chiefComplaint: "",
  duration: "",
  severity: "",
  symptoms: [],
  redFlags: [],
  allergies: [],
  medications: [],
  history: [],
  summary: "",
};

const raw = JSON.parse(readFileSync(join(process.cwd(), "eval/cases.json"), "utf8"));
const cases: EvalCase[] = raw.cases;

let failures = 0;
const rows: string[] = [];

for (const c of cases) {
  // Fact sheets are patient-side statements, so they are prefixed to match the
  // transcript convention the rules expect.
  const transcript = [c.opening, ...c.facts].map((line) => `Patient: ${line}`).join("\n");

  const fired = runRules(transcript, EMPTY);
  const floor = fired.reduce<Pathway>((acc, r) => applyFloor(acc, r.pathway), "GREEN");

  const wantsRed = c.expected.pathway === "RED";
  const reachedRed = floor === "RED";
  const overshoot = !wantsRed && PATHWAY_RANK[floor] > PATHWAY_RANK[c.expected.pathway];

  let verdict = "ok";
  if (wantsRed && !reachedRed) {
    verdict = "GAP — rules would not catch this";
    failures++;
  } else if (overshoot) {
    verdict = `OVERSHOOT — rules alone push to ${floor}`;
    failures++;
  }

  rows.push(
    `${c.id.padEnd(28)} expect ${c.expected.pathway.padEnd(18)} rules→${floor.padEnd(18)} ` +
      `${fired.map((f) => f.id).join(",").padEnd(26)} ${verdict}`,
  );
}

console.log("\nRule coverage (deterministic layer only, no model)\n");
console.log(rows.join("\n"));

const redCases = cases.filter((c) => c.expected.pathway === "RED");
const covered = redCases.filter((c) => {
  const transcript = [c.opening, ...c.facts].map((l) => `Patient: ${l}`).join("\n");
  return (
    runRules(transcript, EMPTY).reduce<Pathway>((a, r) => applyFloor(a, r.pathway), "GREEN") ===
    "RED"
  );
});

console.log(
  `\nRED cases independently reachable by rules: ${covered.length}/${redCases.length}`,
);
console.log(`Problems: ${failures}\n`);

process.exit(failures > 0 ? 1 : 0);

import { Pathway, PATHWAY_RANK, IVerification } from "@/lib/models";
import { Extraction, Triage } from "./schemas";

/**
 * The deterministic verification layer.
 *
 * The single rule that governs this file: it may raise a care pathway, and it
 * may never lower one. A model that under-triages a stroke is the only failure
 * mode here that actually hurts somebody; a model that over-triages a headache
 * costs a clinician two minutes. So the asymmetry is deliberate and absolute —
 * `applyFloor` takes the max of the model's answer and the rules' answer.
 *
 * These rules are a screening net, not a clinical protocol. Seed §9 and §17:
 * real escalation criteria must be signed off by qualified clinicians before
 * any production use.
 */

export interface RedFlagRule {
  id: string;
  label: string;
  pathway: Pathway;
  /** Any one of these matching arms the rule. */
  patterns: RegExp[];
  /** When present, at least one must also match (co-occurrence rules). */
  requires?: RegExp[];
  /**
   * Escape hatch for rules that need real logic rather than a pattern — see
   * `infant-fever`, where the decision turns on parsing an age. Returns an
   * evidence string, or null for no match.
   */
  custom?: (text: string) => string | null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/** Age in weeks, from either "6 weeks old" or "six weeks old". */
function ageInWeeks(text: string): number | null {
  const re = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(day|week|month|year)s?\s*old\b/g;
  let best: number | null = null;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (n === undefined) continue;
    const weeks =
      m[2] === "day" ? n / 7 : m[2] === "week" ? n : m[2] === "month" ? n * 4.35 : n * 52;
    if (best === null || weeks < best) best = weeks;
  }

  if (/\bnew ?born\b|\bneonate\b/.test(text)) best = best === null ? 1 : Math.min(best, 1);
  return best;
}

/**
 * Negation guard. "no chest pain" and "denies shortness of breath" must not
 * fire the rule that "chest pain" and "shortness of breath" would.
 *
 * Contractions matter more than they look: patients answer screening questions
 * with "no, it hasn't spread to my arm", and `\bnot\b` does not match "hasn't".
 */
const NEGATORS =
  /\b(no|not|never|none|denies|denied|without|negative for|ruled out|free of|n't|hasn't|haven't|hadn't|doesn't|don't|didn't|isn't|wasn't|aren't|weren't|can't|cannot|couldn't|won't|wouldn't)\b/;

/** A negator before the match is cancelled by a contrast word after it. */
const CONTRAST = /\b(but|however|although|though|except|apart from|other than)\b/;

/**
 * Quote the match with a little context, snapped to word boundaries. This string
 * is shown to both the patient and the clinician as the reason a rule fired, so
 * a fragment starting mid-word ("he back of the head") reads like a bug and
 * undermines the very thing it is meant to justify.
 */
function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 34);
  const end = Math.min(text.length, index + length + 34);

  let from = start;
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < index) from = space + 1;
  }

  let to = end;
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > index + length) to = space;
  }

  const body = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}

function matchesUnnegated(text: string, pattern: RegExp): string | null {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    /**
     * Scope the negation to the clause the match sits in, not a fixed word
     * window. A six-word lookback missed "No, it hasn't spread to my arms, jaw,
     * or back" — the negator is seven words before "jaw", so the rule fired on a
     * symptom the patient had just denied. A contrast word between the negator
     * and the match ("no fever, but my neck is stiff") cancels the negation.
     */
    const sentenceStart = Math.max(
      text.lastIndexOf(".", m.index - 1),
      text.lastIndexOf("\n", m.index - 1),
      text.lastIndexOf("?", m.index - 1),
      text.lastIndexOf("!", m.index - 1),
      text.lastIndexOf(";", m.index - 1),
    );
    const clause = text.slice(sentenceStart + 1, m.index);

    const negated = NEGATORS.test(clause);
    const contrasted = negated && CONTRAST.test(clause.slice(clause.search(NEGATORS)));

    if (!negated || contrasted) return snippetAround(text, m.index, m[0].length);
  }
  return null;
}

// ------------------------------------------------------------- the rules

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "cardiac",
    label: "Possible acute coronary syndrome",
    pathway: "RED",
    patterns: [/chest (pain|pressure|tightness|discomfort)|crushing (chest|pain)|pain in my chest/],
    requires: [
      /radiat|left arm|down my arm|jaw|shoulder blade|sweat|clammy|short(ness)? of breath|breathless|nause|vomit|dizzy|light ?head/,
    ],
  },
  {
    id: "stroke",
    label: "Possible stroke (FAST positive)",
    pathway: "RED",
    patterns: [
      /face (is )?droop|facial droop|drooping|slurred speech|slurring|can'?t speak|trouble speaking|words? (are )?coming out wrong/,
      /weak(ness)? (in|on) (my |the )?(one|left|right) side|one side of my body|numb(ness)? on (one|the left|the right) side/,
      /sudden (confusion|vision loss|loss of vision|blurred vision in one eye)/,
    ],
  },
  {
    id: "thunderclap",
    label: "Thunderclap headache — possible subarachnoid haemorrhage",
    pathway: "RED",
    // Patients describe this in wildly varying words. The earlier version only
    // matched the textbook phrase "worst headache of my life" and missed both
    // "worst headache of their life" and "came on completely suddenly".
    patterns: [
      /worst headache/,
      /thunderclap/,
      /came on (completely |totally |very )?sudden(ly)?/,
      /sudden(ly)? (severe|worst|explosive|blinding)/,
      /like (being |someone )?(hit|struck|kicked)/,
      /out of nowhere/,
    ],
    requires: [/headache|head pain|\bhead\b|migraine/],
  },
  {
    id: "meningitis",
    label: "Possible meningitis",
    pathway: "RED",
    patterns: [
      /stiff neck|neck stiffness|neck (feels?|is|was|has been) (very |really )?stiff/,
      /can'?t (bend|touch) my chin|rash that does ?n'?t fade|non.?blanching/,
    ],
    requires: [
      /fever|temperature|hot|photophob|headache|confus|drowsy/,
      /(bright )?light (is |feels )?(painful|hurts|uncomfortable)/,
    ],
  },
  {
    id: "airway",
    label: "Airway or breathing compromise",
    pathway: "RED",
    patterns: [
      /can'?t breathe|cannot breathe|struggling to breathe|gasping|choking|turning blue|lips.{0,15}blue/,
      /can'?t (finish|complete) (a |my )?sentence|only speak in short/,
    ],
  },
  {
    id: "anaphylaxis",
    label: "Possible anaphylaxis",
    pathway: "RED",
    patterns: [/throat (is )?(closing|swelling|tight)|tongue (is )?swelling|face (is )?swelling/],
    requires: [/hives|rash|itch|allerg|sting|nut|shellfish|breathe|wheez/],
  },
  {
    id: "sepsis",
    label: "Possible sepsis",
    pathway: "RED",
    patterns: [/fever|temperature (of )?3[89]|shivering|rigors|shaking chills/],
    requires: [/confus|disorient|not making sense|breathing (fast|rapidly)|hasn'?t passed urine|no urine|mottled|very drowsy|can'?t stay awake/],
  },
  {
    id: "consciousness",
    label: "Altered consciousness, collapse or seizure",
    pathway: "RED",
    patterns: [
      /unconscious|unresponsive|passed out|fainted|collapsed|blacked out|seizure|convuls|fitting/,
    ],
  },
  {
    id: "haemorrhage",
    label: "Uncontrolled bleeding",
    pathway: "RED",
    patterns: [
      /bleeding (heavily|a lot|won'?t stop|that won'?t stop)|can'?t stop the bleeding|soaking through|vomit(ing)? blood|coughing up blood|blood in my (vomit|stool)|black tarry/,
    ],
  },
  {
    id: "obstetric",
    label: "Obstetric emergency",
    pathway: "RED",
    patterns: [/pregnan|weeks? pregnant|expecting/],
    requires: [/bleeding|severe (abdominal|stomach) pain|cramping badly|no (fetal |baby )?movement|waters? broke|contractions/],
  },
  {
    id: "self-harm",
    label: "Risk of self-harm — immediate human contact required",
    pathway: "RED",
    patterns: [
      /kill myself|end my life|suicid|don'?t want to (be here|live)|hurt myself|self.?harm|take all my (pills|tablets)/,
    ],
  },
  {
    id: "overdose",
    label: "Possible overdose or poisoning",
    pathway: "RED",
    patterns: [/overdose|took too many|swallowed (bleach|poison)|poisoned/],
  },
  {
    id: "torsion",
    label: "Possible testicular torsion",
    pathway: "RED",
    patterns: [/testic|scrotum|groin/],
    requires: [/sudden|severe|excruciat|swollen and painful/],
  },
  {
    id: "acute-abdomen",
    label: "Possible acute abdomen",
    pathway: "RED",
    patterns: [/(abdominal|stomach|belly) pain/],
    requires: [/rigid|board.?like|can'?t (stand|move|straighten)|rebound|worst pain|10 out of 10|9 out of 10/],
  },
  {
    id: "infant-fever",
    label: "Fever in an infant under three months",
    pathway: "RED",
    // Pattern matching cannot express "under 13 weeks" — the earlier version of
    // this rule missed "six weeks old" because it only recognised digits and the
    // words one/two/three. Age parsing belongs in code.
    patterns: [],
    custom: (text) => {
      if (!/fever|temperature|hot to touch|\b3[89](\.\d)?\b|\b4[01](\.\d)?\b/.test(text)) {
        return null;
      }
      const weeks = ageInWeeks(text);
      if (weeks === null || weeks > 13) return null;
      return `infant approximately ${weeks.toFixed(0)} week(s) old with reported fever`;
    },
  },
  {
    id: "cauda-equina",
    label: "Possible cauda equina syndrome",
    pathway: "RED",
    patterns: [
      /saddle|between (my |the )?legs|numb.{0,25}(groin|genital|buttock|bottom)|can'?t feel.{0,20}(wipe|toilet)/,
      /can'?t (start|pass|feel).{0,15}(urin|wee|pee)|not (feel|felt).{0,15}(bladder|urin)|retention|lost control of my (bladder|bowel)|wetting myself|incontinen/,
      /both legs (feel )?(weak|heavy|numb)|weakness in both legs/,
    ],
    requires: [/back pain|back has|spine|lifted|slipped disc|sciatic/],
  },
  {
    id: "airway-swelling",
    label: "Possible epiglottitis or deep neck infection",
    pathway: "RED",
    patterns: [
      /drool|can'?t swallow (my )?(own )?saliva|unable to swallow|muffled voice|hot potato|voice sounds? muffled/,
      /sitting (up )?(and )?leaning forward|tripod/,
    ],
    requires: [/throat|swallow|neck|voice|breath|fever|temperature|3[89]/],
  },

  // ---- clinician-level, not emergency ----
  {
    id: "persistent-fever",
    label: "Persistent fever",
    pathway: "YELLOW",
    patterns: [/fever|temperature/],
    requires: [/(four|five|six|seven|[4-9]|1[0-9])\s*days|over a week|more than a week|two weeks/],
  },
  {
    id: "unintentional-weight-loss",
    label: "Unintentional weight loss",
    pathway: "YELLOW",
    patterns: [/losing weight|lost .{0,12}(kg|kilo|pounds|stone)|weight loss/],
    requires: [/without trying|not trying|no reason|unintention/],
  },
  {
    id: "persistent-symptom",
    label: "Symptom persisting beyond two weeks",
    pathway: "YELLOW",
    // "five weeks" was missed by the earlier alternation, which only spelled out
    // three and four. Patients write durations in words at least as often as digits.
    patterns: [
      /\b(three|four|five|six|seven|eight|nine|ten|eleven|twelve|[3-9]|1[0-9])\s*weeks?\b/,
      /over a month|for months|two months|couple of months|since \w+ (last )?year/,
    ],
  },
  {
    id: "med-request",
    label: "Medication request requiring authorisation",
    pathway: "MEDICATION_REVIEW",
    patterns: [
      /antibiotic|amoxicillin|augmentin|prescription for|prescribe me|refill|repeat prescription|need (some )?(medication|meds|tablets) for/,
    ],
  },
];

// ------------------------------------------------------------ the layer

export interface VerifyInput {
  /** Everything the patient said, plus anything read off an upload. */
  transcript: string;
  extraction: Extraction;
  triage: Triage;
  /** True when the extraction had to be repaired to satisfy the schema. */
  schemaRepaired?: boolean;
}

export interface VerifyResult {
  pathway: Pathway;
  urgency: string;
  requiresHumanReview: boolean;
  verification: IVerification;
}

const REQUIRED_FIELDS: (keyof Extraction)[] = ["chiefComplaint", "duration", "severity"];

/**
 * Keep only what the patient actually said.
 *
 * The rules previously matched the whole transcript, which meant the agent's own
 * questions counted as evidence: asking "does the pain spread to your left arm?"
 * satisfied the cardiac rule's co-occurrence condition even when the patient
 * answered no. A screening question is not a symptom.
 *
 * Falls back to the full text when the transcript does not use the speaker
 * convention, so a caller passing raw prose still gets screened.
 */
export function patientUtterances(transcript: string): string {
  const lines = transcript.split("\n");
  const patient = lines.filter((l) => /^\s*patient\s*:/i.test(l));
  if (!patient.length) {
    return lines.some((l) => /^\s*(service|assistant|ai)\s*:/i.test(l)) ? "" : transcript;
  }
  return patient.map((l) => l.replace(/^\s*patient\s*:\s*/i, "")).join("\n");
}

export function runRules(transcript: string, extraction: Extraction) {
  // Extracted red flags and symptoms count as evidence too — a flag the model
  // spotted but then failed to act on is exactly what this layer is for.
  const haystack = [
    patientUtterances(transcript),
    extraction.redFlags.join(". "),
    extraction.symptoms.join(". "),
    extraction.chiefComplaint,
    extraction.duration,
    extraction.severity,
  ]
    .join("\n")
    .toLowerCase();

  const fired: IVerification["rulesFired"] = [];

  for (const rule of RED_FLAG_RULES) {
    let evidence: string | null = null;

    if (rule.custom) {
      evidence = rule.custom(haystack);
      if (!evidence) continue;
    } else {
      for (const p of rule.patterns) {
        evidence = matchesUnnegated(haystack, p);
        if (evidence) break;
      }
      if (!evidence) continue;

      if (rule.requires) {
        const co = rule.requires.some((p) => matchesUnnegated(haystack, p));
        if (!co) continue;
      }
    }

    fired.push({
      id: rule.id,
      label: rule.label,
      pathway: rule.pathway,
      evidence: evidence.replace(/\s+/g, " ").slice(0, 160),
    });
  }

  return fired;
}

/** max(model pathway, rule pathway) — the whole point of the layer. */
export function applyFloor(modelPathway: Pathway, floor: Pathway): Pathway {
  return PATHWAY_RANK[floor] > PATHWAY_RANK[modelPathway] ? floor : modelPathway;
}

export function verify(input: VerifyInput): VerifyResult {
  const { transcript, extraction, triage } = input;

  const rulesFired = runRules(transcript, extraction);

  const floor = rulesFired.reduce<Pathway>(
    (acc, r) => applyFloor(acc, r.pathway),
    "GREEN",
  );

  const modelPathway = triage.carePathway as Pathway;
  const finalPathway = applyFloor(modelPathway, floor);
  const escalated = finalPathway !== modelPathway;

  const missingFields = REQUIRED_FIELDS.filter((f) => {
    const v = extraction[f];
    return !v || v === "unknown" || (typeof v === "string" && v.trim() === "");
  }).map(String);

  const escalationReason = escalated
    ? rulesFired
        .filter((r) => PATHWAY_RANK[r.pathway] >= PATHWAY_RANK[finalPathway])
        .map((r) => r.label)
        .join("; ")
    : undefined;

  return {
    pathway: finalPathway,
    // An escalation to RED must carry urgency with it, whatever the model said.
    urgency: finalPathway === "RED" ? "urgent" : triage.urgency || "non_urgent",
    // Anything above self-care needs a person. RED needs one immediately.
    requiresHumanReview: finalPathway !== "GREEN" || triage.requiresHumanReview,
    verification: {
      valid: missingFields.length === 0,
      schemaRepaired: Boolean(input.schemaRepaired),
      escalated,
      escalatedFrom: escalated ? modelPathway : undefined,
      escalationReason,
      rulesFired,
      missingFields,
    },
  };
}

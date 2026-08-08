/**
 * Chat answers for demo mode.
 *
 * Free-text questions cannot be convincingly mocked, so the demo answers a
 * fixed set surfaced as suggested cards, and tells the truth about anything
 * else. Two rules make that honest rather than merely canned:
 *
 *  1. Every answer is condensed from a cell of a recorded run — the DDQ Gap &
 *     Consistency Scan (`recorded-ddq-scan-run.json`, the same run the grid
 *     replays), the ODD Screen, or the LPA / ILPA-Alignment Review, named
 *     against each answer's `cited()` call. Chat therefore cannot contradict
 *     a grid, because it is a grid's own output. A finding that is real in the
 *     corpus but that no recorded run made — the 100% vs 50% fee-offset
 *     contradiction — is deliberately absent: the demo must never present a
 *     finding its fixture does not contain. (The affiliated broker-dealer is
 *     the opposite case: the ODD Screen recording does cite it, at
 *     `brightwater_adv_part2a.pdf` p6, so the conflicts answer does too.)
 *
 *     That cuts the other way too, and it is the sharper edge. Where a run
 *     concluded the documents *agree* on something the corpus in fact
 *     contradicts, repeating the conclusion turns a silent miss into an active
 *     false statement — and a prospect who opens the DDQ this demo itself
 *     serves finds the contradiction in a page. So the DDQ scan's affirmative
 *     consistency verdict on fees is deleted rather than quoted.
 *  2. Citations are not authored. `cited()` lifts the recorded `Citation`
 *     objects straight out of the run by their `[Source N]` number, so every
 *     `source_file` / `page` / `text_snippet` triple is one the product itself
 *     produced against the real documents.
 */
import type { Citation, QueryStreamEvent } from "@/lib/api";
import type { SseHandlers } from "@/lib/sse";
import { DEMO_FUND_III_ID, DEMO_FUND_IV_ID } from "./entities";
import { RECORDING_BY_WORKFLOW } from "./workflowRegistry";

export interface DemoAnswer {
  question: string;
  /** The workspace this question belongs to. It answers in no other. */
  dealId: string;
  /** One-line card copy. */
  blurb: string;
  /** Distinctive phrases — one match selects this answer. */
  anchors: readonly string[];
  /** Broad topic words — two or more must appear together to select. */
  support: readonly string[];
  answer: string;
  citations: Citation[];
}

/**
 * Shown for anything outside the fixed set. It names the limitation instead of
 * working around it: a fabricated answer here would break the one promise —
 * every claim cited to a page — that the rest of the demo exists to make.
 */
export const OFF_SCRIPT_ANSWER =
  "**This demo answers a fixed set of questions.**\n\n" +
  "The answers you can see here were produced by Vyntic against the Brightwater " +
  "documents and recorded, so no model is running behind this page. That means I " +
  "cannot answer this one — and I am not going to invent an answer, because an " +
  "uncited claim is exactly what this product exists to eliminate.\n\n" +
  "Pick one of the suggested questions to see a real cited answer. In the live " +
  "product the same question runs against your own documents, and every sentence " +
  "resolves back to a page.";

/**
 * Recordings the chat answers are condensed from, and the columns within them.
 * Built-in workflow and column ids are stable across startup reconciliation
 * (CLAUDE.md invariant 4), so naming them here cannot drift silently — and
 * `cited` throws if one stops resolving.
 */
export const WF_DDQ_SCAN = "builtin_lp_ddq_scan";
export const WF_ODD_SCREEN = "builtin_lp_odd_screen";
export const WF_LPA_REVIEW = "builtin_lp_lpa_review";
export const WF_SIDE_LETTERS = "builtin_lp_side_letters";

const COL_TEAM = "68558a7e665548a28536c1b7f2a13314"; // Team & Succession
const COL_TERMS = "a01ad37a06444c348b93de7cecd96e5f"; // Fund Terms & Economics
const COL_VALUATION = "9814f84441844e788e44523b2002848c"; // Valuation Policy
const COL_COMPLIANCE = "9f181791b2a247a59135123e8b7de3d0"; // Compliance & Regulatory
const COL_IT = "b778bec0d4c84fb6b3ecc85a1c24f3fb"; // IT & Cybersecurity
export const COL_ODD_CONFLICTS = "c0ee1cfab63f474b9fb58a484d39c63c";
const COL_ODD_PROVIDERS = "f4a0afc4a62e453595b1570b444fb4fe";
const COL_LPA_INDEMNITY = "bc3b63ca80b846428f0cea876b1a9e4d";
const COL_SL_OBLIGATIONS = "36d71bb878af4ae0a5ef3d273226c7e6";
const COL_SL_DEADLINES = "504c0842b45848d191ab7d4a4b46218f";
const COL_SL_MFN = "c1c656b232504d08a445e5e0121511f3";

/**
 * Lifts recorded citations by their `[Source N]` number, in the order the chat
 * answer references them, and renumbers them densely from 1.
 *
 * The recorded `citations` array is sparse — indexed by the global source
 * number of the whole run, mostly nulls. Chat answers are short, so they carry
 * a dense list and renumber their markers to match; `chat.test.ts` checks that
 * every `[Source N]` in an answer resolves inside its own list, because
 * `AnswerText` drops an out-of-range marker silently.
 *
 * Throws on drift rather than degrade: a re-recording that renumbers sources
 * must fail a test in development, not quietly strip the citations off a
 * prospect's screen.
 */
export function cited(
  workflowId: string,
  columnId: string,
  sourceNumbers: readonly number[]
): Citation[] {
  const recording = RECORDING_BY_WORKFLOW.get(workflowId);
  if (!recording) {
    throw new Error(
      `Demo chat: no recording for workflow ${workflowId}. ` +
        "The registry and the chat fixtures have drifted apart."
    );
  }
  const cell = recording.run.cells.find((c) => c.column_id === columnId);
  if (!cell) {
    throw new Error(
      `Demo chat: the recorded ${workflowId} run has no cell for column ${columnId}. ` +
        "The recording and the chat fixtures have drifted apart."
    );
  }
  return sourceNumbers.map((n) => {
    const citation = cell.citations[n - 1];
    if (!citation) {
      throw new Error(
        `Demo chat: recorded cell ${columnId} has no [Source ${n}]. ` +
          "The recording and the chat fixtures have drifted apart."
      );
    }
    return citation;
  });
}

export const DEMO_QUESTIONS: DemoAnswer[] = [
  {
    question: "Has any senior investment professional left the firm?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "Cross-check the DDQ's team answer against the Form ADV, PPM and pitchbook.",
    anchors: [
      "roache",
      "key person",
      "key persons",
      "departure",
      "departed",
      "left the firm",
      "succession",
    ],
    // Not "partner"/"partners": paired with "team" they fire on questions about
    // headcount, which this answer does not answer.
    support: ["team", "senior", "professional", "stability", "turnover"],
    answer:
      "A material inconsistency exists: the Form ADV (dated July 2026) discloses that " +
      "Daniel Roache, listed as a Partner and Head of Value Creation in the PPM and " +
      "pitchbook, ceased being an advisory employee effective February 28, 2026 " +
      "[Source 1][Source 2][Source 3].\n\n" +
      "The DDQ describes an institutionalized team model with shared investment " +
      "committee participation, cross-staffed deal teams and written succession " +
      "protocols, and states that key person coverage is intended for the duration of " +
      "the Fund IV investment period [Source 4].\n\n" +
      "**Follow-up questions**\n" +
      "- Does Mr. Roache's departure trigger a \"Key Person Event\" under the current " +
      "LPA terms, and has the Advisory Committee been notified or granted a waiver?\n" +
      "- Why do the PPM and pitchbook (dated July 2026) continue to present Mr. Roache " +
      "as a current Partner and Head of Value Creation if he ceased employment in " +
      "February 2026?",
    // Form ADV p2, PPM p4, pitchbook p4, DDQ p2.
    citations: cited(WF_DDQ_SCAN, COL_TEAM, [64, 44, 56, 22]),
  },
  {
    question: "Has the manager had any regulatory issues?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "Regulatory history in the Form ADV — and what the marketing documents leave out.",
    anchors: [
      "deficiency",
      "deficiency letter",
      "regulatory issue",
      "regulatory issues",
      "regulatory history",
      "sec",
      "examination",
      "enforcement",
      "regulator",
    ],
    support: ["compliance", "regulatory", "litigation", "history", "issues"],
    answer:
      "In 2023, the Firm received an SEC deficiency letter concerning the documentation " +
      "of expense allocation among funds and co-investment vehicles. It resulted in " +
      "enhanced written allocation procedures, remediated sampled allocations and " +
      "additional employee training, with no monetary penalty imposed [Source 1].\n\n" +
      "The PPM and pitchbook do not detail the 2023 SEC deficiency or the remediation " +
      "effort; it is disclosed only in the Form ADV [Source 1]. The DDQ describes a " +
      "compliance manual, code of ethics, restricted-list process, annual compliance " +
      "review and employee certification procedures, with regulatory correspondence " +
      "managed by the chief compliance officer and outside counsel [Source 2].\n\n" +
      "**Follow-up questions**\n" +
      "- Can the Firm provide the full text of the 2023 SEC deficiency letter and the " +
      "subsequent response and remediation confirmation?\n" +
      "- Has the Firm undergone any regulatory examinations or received any other " +
      "deficiency letters since the 2023 matter?",
    // Form ADV p10, DDQ p9.
    citations: cited(WF_DDQ_SCAN, COL_COMPLIANCE, [72, 29]),
  },
  {
    question: "What are the gaps in the firm's cybersecurity program?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "What the DDQ concedes about SOC 2 and testing cadence.",
    anchors: [
      "soc 2",
      "cyber",
      "cybersecurity",
      "penetration",
      "pen test",
      "information security",
    ],
    support: ["security", "controls", "testing", "vendor", "vendors", "technology", "gaps"],
    answer:
      "- **Governance gaps:** The Firm does not maintain a formal SOC 2 report " +
      "[Source 1].\n" +
      "- **Testing cadence:** The testing schedule is determined at management's " +
      "discretion rather than by a defined policy or interval [Source 1].\n" +
      "- **Infrastructure:** The Firm uses cloud-hosted systems, multi-factor " +
      "authentication, endpoint protection and employee awareness reminders, and " +
      "discusses cyber readiness periodically with outside technology vendors " +
      "[Source 1].\n" +
      "- **Contradictions:** None identified — the PPM and pitchbook do not provide " +
      "granular detail on cybersecurity beyond general operational risk management " +
      "[Source 2].\n\n" +
      "**Follow-up questions**\n" +
      "- Given the lack of a formal SOC 2 report, does the Firm have a target date for " +
      "obtaining one, or does it rely on alternative third-party security audits?\n" +
      "- Can the Firm provide the last three years of penetration testing results, or a " +
      "summary of any historical cybersecurity incidents?",
    // DDQ p10, PPM p11.
    citations: cited(WF_DDQ_SCAN, COL_IT, [30, 51]),
  },
  {
    question: "How does the valuation policy handle Level 3 assets?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "Valuation governance, and how often an outside party sees the marks.",
    anchors: [
      "level 3",
      "valuation policy",
      "valuation committee",
      "marks",
      "mark to market",
    ],
    support: ["valuation", "valued", "quarterly", "third party", "committee", "independent"],
    answer:
      "Level 3 portfolio company marks are prepared by the investment team and reviewed " +
      "by finance and the valuation committee each quarter; third-party valuation review " +
      "is obtained annually [Source 1].\n\n" +
      "The Firm maintains a written valuation policy for quarterly assessments, run by a " +
      "valuation committee that includes finance, investment, compliance and portfolio " +
      "operations representatives [Source 2]. Methodologies include comparable company " +
      "multiples, precedent transactions, discounted cash flow analyses and recent " +
      "financing transactions [Source 3].\n\n" +
      // The recorded cell put the PPM alongside the DDQ here and cited PPM p6.
      // p6 is "Portfolio Construction", and its only quarterly reference is to
      // the *investment* committee; no PPM page supports the claim. The PPM
      // half and its citation are dropped rather than left to be checked.
      "**Consistency:** The DDQ agrees on the quarterly valuation cadence and the " +
      "use of a valuation committee [Source 4]. No contradictions identified.\n\n" +
      "**Follow-up questions**\n" +
      "- Can you provide the most recent third-party valuation report for a " +
      "representative Level 3 asset?\n" +
      "- What specific \"material events\" trigger an ad-hoc valuation review outside the " +
      "quarterly cycle [Source 2]?",
    // Valuation policy p4, p2, p3; DDQ p8.
    citations: cited(WF_DDQ_SCAN, COL_VALUATION, [76, 74, 75, 28]),
  },
  {
    // Not "…and do the documents agree?": the answer no longer renders a
    // verdict on that, because the run's verdict was wrong (see below).
    question: "What are the fund's economic terms?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "Fees, carry, offset and removal — read across the LPA, PPM, pitchbook and DDQ.",
    // "fees" and "fee structure" are anchors, not support words: "what are the
    // fees" is close to the single most likely thing a prospect types, and as
    // support alone it scored one hit and fell back. The answer is now purely
    // descriptive of the LPA's stated terms, so there is nothing risky to
    // reach — the demo was refusing the safe question and answering the sharp
    // one, which is exactly backwards.
    anchors: [
      "fee offset",
      "management fee",
      "fees",
      "fee structure",
      "carried interest",
      "carry",
      "waterfall",
      "gp commitment",
      "economic terms",
      "fund terms",
      "clawback",
      "preferred return",
    ],
    support: ["fee", "terms", "economics", "removal", "offset", "commitment"],
    answer:
      "- **Management fee:** 2.0% per annum of aggregate commitments during the " +
      "five-year investment period; thereafter 1.5% per annum of invested capital, " +
      "calculated quarterly in advance [Source 1][Source 6][Source 7].\n" +
      "- **Carried interest:** 20%, on a whole-fund European waterfall, subject to an 8% " +
      "preferred return, a 100% GP catch-up and a customary clawback " +
      "[Source 2][Source 6][Source 7].\n" +
      "- **Fee offset:** 50% of transaction, monitoring, directors and similar fees " +
      "received by the General Partner, Manager or their affiliates offset the " +
      "management fee [Source 3][Source 6][Source 7].\n" +
      "- **GP commitment:** Not less than 2.0% of aggregate commitments " +
      "[Source 4][Source 6][Source 7].\n" +
      "- **Removal:** No-fault removal requires Limited Partners holding at least 80% of " +
      "aggregate commitments, excluding interests held by the General Partner and its " +
      "affiliates [Source 5][Source 6].\n\n" +
      // The recorded cell closed with "the terms are consistent across the DDQ,
      // PPM and pitchbook". They are not: DDQ p7 answers the fee-offset
      // question with "100% of such fees" against the LPA's and PPM's 50%, and
      // the run cited p7 nowhere. Stating the recording's verdict here would be
      // a confident, well-cited claim contradicted by a document one click
      // away, so it is deleted; what is left is description, not adjudication.
      "The DDQ directs the reader to the draft Partnership Agreement for the " +
      "detailed economics [Source 8].\n\n" +
      "**Worth testing:** the Firm received a 2023 SEC deficiency letter on the " +
      "documentation of expense allocation [Source 9], which bears on the judgment " +
      "applied to fee offsets and expense allocation described in the PPM [Source 10].",
    // LPA p5, p7, p6, p3, p12; PPM p2; pitchbook p6; DDQ p6; ADV p10; PPM p11.
    citations: cited(WF_DDQ_SCAN, COL_TERMS, [5, 7, 6, 3, 12, 42, 58, 26, 72, 51]),
  },
  {
    question: "What conflicts of interest are disclosed?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "Affiliated service providers, the broker-dealer, and how expenses get allocated.",
    anchors: [
      "conflict",
      "conflicts",
      "conflicts of interest",
      "broker dealer",
      "brightwater securities",
      "affiliated",
      "affiliate",
      "related party",
    ],
    support: ["disclosed", "interest", "allocation", "expenses", "affiliates"],
    // Condensed from the ODD Screen run's Conflicts of interest cell. One
    // sentence of that cell is deliberately dropped: it stated the 50% fee
    // offset while citing brightwater_iv_ddq.pdf p7, which reads "100% fee
    // offset" — a citation pointing at the page that refutes the sentence
    // above it. Deleting it is condensation; keeping it would hand a prospect
    // a chip that opens a contradiction.
    answer:
      "The Firm addresses potential conflicts through its compliance manual, advisory " +
      "committee process, and allocation policy [Source 1]. Affiliated service providers " +
      "are described as generally limited to the General Partner and management company " +
      "[Source 1].\n\n" +
      "The Form ADV discloses that Brightwater Securities, LLC, an affiliated " +
      "broker-dealer under common control with the Manager, may receive transaction fees " +
      "or placement-related compensation in connection with portfolio company " +
      "transactions [Source 2].\n\n" +
      "In 2023 the Firm received an SEC deficiency letter regarding documentation of " +
      "expense allocation, which was subsequently remediated through enhanced procedures " +
      "and training [Source 3]. Broken-deal expenses are allocated among participating " +
      "vehicles based on the opportunity pursued and the benefits expected [Source 4].",
    // DDQ p12, Form ADV p6, Form ADV p10, DDQ p13.
    citations: cited(WF_ODD_SCREEN, COL_ODD_CONFLICTS, [32, 68, 72, 33]),
  },
  {
    question: "Who are the fund's service providers?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "Auditor, administrator and counsel — and the two the documents never name.",
    anchors: [
      "service provider",
      "service providers",
      "auditor",
      "administrator",
      "custodian",
      "fund counsel",
      "prime broker",
      "who audits",
    ],
    support: ["provider", "audit", "administration", "counsel", "outsourced"],
    // "Not found" is kept verbatim from the recording rather than rewritten as
    // "not disclosed": the run reports what it could not find, and the ability
    // to say so at all is what the require_citations fix restored. Softening it
    // into a claim about the documents would be adding a finding.
    answer:
      "From the DDQ's service-provider section [Source 1]:\n\n" +
      "- **Auditor:** Huxley Markham & Co. LLP\n" +
      "- **Administrator:** North Pier Fund Services\n" +
      "- **Fund counsel:** Alder & Finch LLP\n" +
      "- **Custodian:** Not found\n" +
      "- **Prime broker:** Not found\n\n" +
      "The last two are not an omission in this answer — the extraction found no " +
      "statement of either in the documents it read.",
    // DDQ p14.
    citations: cited(WF_ODD_SCREEN, COL_ODD_PROVIDERS, [34]),
  },
  {
    question: "Where does the LPA lean GP-favorable?",
    dealId: DEMO_FUND_IV_ID,
    blurb: "The ILPA-alignment review's two GP-favorable ratings, both on one clause.",
    anchors: [
      "gp favorable",
      "gp-favorable",
      "ilpa",
      "indemnification",
      "exculpation",
      "fiduciary duty",
      "lpa lean",
    ],
    support: ["lpa", "clause", "alignment", "favorable", "principles"],
    // Both GP-favorable ratings in the LPA / ILPA-Alignment Review rest on the
    // same Section 17 clause, so this answer cites it once and says so, rather
    // than quoting it twice as two findings.
    answer:
      "The ILPA-alignment review rates most of the LPA at market — economics, key " +
      "person, GP removal, LPAC powers, transfers and reporting. Two columns come back " +
      "**GP-favorable**, and both rest on the same clause.\n\n" +
      "Section 17: \"The Partnership shall indemnify the General Partner, Manager and " +
      "covered persons to the fullest extent permitted by law for actions taken in good " +
      "faith on behalf of the Partnership.\" [Source 1]\n\n" +
      "The review reads that scope as broad protection for the General Partner and its " +
      "affiliates — common in private equity agreements, but GP-favorable relative to " +
      "ILPA-aligned provisions that limit indemnification to gross negligence, willful " +
      "misconduct or bad faith [Source 1]. The fiduciary-duty column returns the same " +
      "rating on the same clause.",
    // LPA p17.
    citations: cited(WF_LPA_REVIEW, COL_LPA_INDEMNITY, [17]),
  },
];

/** Short display tag for a corpus filename, used on the suggestion cards. */
export function demoDocLabel(filename: string): string {
  switch (filename) {
    case "brightwater_iv_ddq.pdf":
      return "DDQ";
    case "brightwater_iv_ppm.pdf":
      return "PPM";
    case "brightwater_iv_lpa.pdf":
      return "LPA";
    case "brightwater_iv_pitchbook.pdf":
      return "Pitchbook";
    case "brightwater_adv_part2a.pdf":
      return "Form ADV";
    case "brightwater_valuation_policy.pdf":
      return "Valuation policy";
    case "brightwater_track_record.xlsx":
      return "Track record";
    default:
      return filename;
  }
}

export interface DemoPromptCard {
  title: string;
  dealId: string;
  blurb: string;
  chips: string[];
  prompt: string;
}

/**
 * Suggestion cards for the chat empty state. The chips are the documents the
 * answer actually cites, derived from its citations rather than written by
 * hand, so a card cannot advertise a source the answer does not use.
 */
export const DEMO_PROMPT_CARDS: DemoPromptCard[] = DEMO_QUESTIONS.map((q) => ({
  title: q.question,
  dealId: q.dealId,
  blurb: q.blurb,
  chips: [...new Set(q.citations.map((c) => demoDocLabel(c.source_file)))].slice(0, 3),
  prompt: q.question,
}));

/**
 * Cards for a workspace. A fund with no recorded material gets none rather
 * than a borrowed set: offering another fund's questions invites a click that
 * can only answer off-script.
 */
export function demoPromptCardsFor(dealId: string): DemoPromptCard[] {
  return DEMO_PROMPT_CARDS.filter((card) => card.dealId === dealId);
}

// ── Matching ──────────────────────────────────────────────────────────────

/** Broad topic words only count in pairs; one alone is not a question. */
const MIN_SUPPORT_HITS = 2;

/**
 * `DealAssistantPanel` prefixes the question with the documents the visitor
 * ticked. That prefix carries corpus filenames, which would otherwise feed the
 * matcher words the visitor never typed.
 */
const DOC_SCOPE_PREFIX = /^focus on these document\(s\):[\s\S]*?\n\n/i;

/**
 * Fund names that identify a *workspace* in the demo. A question naming a fund
 * other than the one being asked in is refused, whatever else it matches.
 *
 * This has to be relative rather than a fixed list. "What is the management fee
 * for Fund III?", typed in Fund IV, would otherwise come back with Fund IV's
 * 2.0% — a different fund's economics, cited to Fund IV's LPA, in an answer
 * that never says so. The mirror image is just as wrong, and a fixed
 * Fund-IV-centric list gets it backwards the moment Fund III can answer at all.
 */
const FUND_MENTIONS: Record<string, readonly string[]> = {
  [DEMO_FUND_IV_ID]: ["fund iv", "fund 4", "fourth fund"],
  [DEMO_FUND_III_ID]: ["fund iii", "fund 3", "third fund"],
};

/**
 * Funds the corpus refers to but the demo has no workspace for. Named in any
 * workspace, they are always someone else's fund.
 */
const UNRECORDED_FUND_MENTIONS = ["fund i", "fund ii", "fund 1", "fund 2"] as const;

/**
 * True if the question names a fund that is not the one being asked in.
 *
 * `normalize` pads with spaces, so "fund i" cannot match inside "fund iii" —
 * that padding is what makes this list safe to write shortest-first.
 */
function mentionsAnotherFund(asked: string, dealId: string): boolean {
  if (hits(asked, UNRECORDED_FUND_MENTIONS) > 0) return true;
  for (const [id, phrases] of Object.entries(FUND_MENTIONS)) {
    if (id === dealId) continue;
    if (hits(asked, phrases) > 0) return true;
  }
  return false;
}

/** Space-delimited, punctuation-free, so `includes` matches whole words only. */
function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function hits(haystack: string, phrases: readonly string[]): number {
  let n = 0;
  for (const phrase of phrases) {
    if (haystack.includes(normalize(phrase))) n += 1;
  }
  return n;
}

/** Every question belonging to a workspace. Empty for a fund with no set. */
export function questionsFor(dealId: string): DemoAnswer[] {
  return DEMO_QUESTIONS.filter((q) => q.dealId === dealId);
}

/**
 * Selects the canned answer for a question, or null if there isn't one.
 *
 * Matching is deliberately tight. Loose keyword matching would answer "what is
 * the valuation of the largest portfolio company" with the Level 3 review
 * policy — a confident, well-cited, wrong answer, which is a worse failure than
 * admitting the demo cannot answer it. So a broad topic word ("valuation",
 * "committee", "compliance") never selects an answer on its own: either a
 * distinctive anchor phrase appears, or at least two topic words do.
 *
 * A question that names a fund other than the one being asked in is refused
 * outright, whatever else it matches.
 */
export function matchDemoQuestion(text: string, dealId: string): DemoAnswer | null {
  const asked = normalize(text.replace(DOC_SCOPE_PREFIX, ""));
  if (asked.trim() === "") return null;
  if (mentionsAnotherFund(asked, dealId)) return null;

  const candidates = questionsFor(dealId);
  for (const q of candidates) {
    if (normalize(q.question) === asked) return q;
  }

  let best: DemoAnswer | null = null;
  let bestScore = 0;
  for (const q of candidates) {
    const anchorHits = hits(asked, q.anchors);
    const supportHits = hits(asked, q.support);
    if (anchorHits === 0 && supportHits < MIN_SUPPORT_HITS) continue;
    const score = anchorHits * 10 + supportHits;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

// ── Streaming ─────────────────────────────────────────────────────────────

/** Pause before the first token, so the answer does not appear pre-baked. */
const FIRST_TOKEN_MS = 260;
/** Beat between token batches, and how many split parts go out per beat. */
const STEP_MS = 14;
const PARTS_PER_STEP = 4;

/** The one stream this fixture answers: the fund chat's single-question POST. */
const CHAT_STREAM_URL = /^\/api\/deals\/([^/]+)\/query\/stream$/;

/** The doc matrix — reached from `/app` by a column chip or the free-text Ask. */
const DOC_MATRIX_STREAM_URL = /^\/api\/deals\/[^/]+\/doc-matrix\/stream$/;

/**
 * Shown per document when something reaches the doc-matrix stream. The demo's
 * primary answer is that `DocMatrixPanel` doesn't offer the controls at all
 * (see its demo branch); this is the backstop, so a control added later
 * degrades to a sentence in the cell instead of a spinner that never resolves.
 *
 * An `error` event is the only honest event shape here. A `done` would put a
 * confident, uncited answer in an answer cell — the one thing this product
 * exists to eliminate — and a `token` stream would be the same lie, typed out.
 */
export const DOC_MATRIX_UNAVAILABLE =
  "The document matrix runs a fresh model query per document. This demo " +
  "serves recorded output only, so it isn't wired here — open a fund and ask " +
  "in Agent, or watch the recorded DDQ scan under Workflows.";

/** Doc ids from the doc-matrix request body, so each cell can resolve. */
function docIdsFromBody(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const value = (body as Record<string, unknown>).doc_ids;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

function questionFromBody(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const record: Record<string, unknown> = { ...body };
  const value = record.question ?? record.query;
  return typeof value === "string" ? value : "";
}

/**
 * Streams a canned answer token-by-token so chat looks live, in the exact
 * `QueryStreamEvent` shape `singleQuestionStream`'s consumer expects: `token`
 * events while it types, then one `done` carrying the full answer and its
 * citations (lib/api.ts:736-764).
 *
 * Only the fund chat stream carries answers. The doc matrix degrades to one
 * honest `error` event per document, which its cells render in place; any other
 * POST stream (matrix compare) gets `onError`, because chat-shaped events it
 * cannot read would put empty cells on screen with nothing to explain them.
 */
export function demoSseStream(
  url: string,
  body: unknown,
  handlers: SseHandlers<unknown>
): AbortController {
  const controller = new AbortController();
  const path = url.split("?")[0];
  const match = path.match(CHAT_STREAM_URL);

  if (!match) {
    if (DOC_MATRIX_STREAM_URL.test(path)) {
      // Synchronous: the caller has already painted "Analyzing…" into every
      // cell, and there is nothing to wait for.
      for (const docId of docIdsFromBody(body)) {
        handlers.onEvent({ doc_id: docId, error: DOC_MATRIX_UNAVAILABLE });
      }
      handlers.onFinish?.();
      return controller;
    }
    handlers.onError?.(
      new Error("This surface is not part of the demo — no fixture streams this endpoint.")
    );
    return controller;
  }

  const dealId = match[1];
  const question = questionFromBody(body);
  // Which questions answer here is now a property of the question set, not of
  // this line: a fund with no recorded material has no questions, so every
  // ask in it falls through to the honest fallback.
  const matched = matchDemoQuestion(question, dealId);
  const answer = matched?.answer ?? OFF_SCRIPT_ANSWER;
  const citations: Citation[] = matched?.citations ?? [];

  const parts = answer.split(/(\s+)/);
  let index = 0;

  const emit = (event: QueryStreamEvent): void => handlers.onEvent(event);

  const tick = (): void => {
    if (controller.signal.aborted) return;

    if (index >= parts.length) {
      emit({ type: "done", deal_id: dealId, question, answer, citations });
      handlers.onFinish?.();
      return;
    }

    const token = parts.slice(index, index + PARTS_PER_STEP).join("");
    index += PARTS_PER_STEP;
    emit({ type: "token", deal_id: dealId, question, token });
    setTimeout(tick, STEP_MS);
  };

  setTimeout(tick, FIRST_TOKEN_MS);
  return controller;
}

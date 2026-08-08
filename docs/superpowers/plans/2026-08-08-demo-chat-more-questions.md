# More Demo Chat Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-08-demo-chat-more-questions-design.md`

**Goal:** Widen the demo's Agent-tab question set from five cards to eleven, and give Fund III its first question set, drawing every new answer from recordings that already ship.

**Architecture:** `chat.ts` today assumes one fund and one recording: `cited()` closes over the DDQ run, and `matchDemoQuestion` has no idea which workspace is asking. Both assumptions get a parameter. Questions gain a `dealId`, the matcher takes the asking fund, `cited()` resolves any recording through `RECORDING_BY_WORKFLOW`, and the "other fund" refusal becomes relative to where you're standing instead of a fixed Fund-IV-centric list. Everything else — the streaming shape, the card derivation, the off-script fallback — is unchanged.

**Tech Stack:** TypeScript, Vitest. No React changes: `DealAssistantPanel` already calls `demoPromptCardsFor(deal.deal_id)` and renders whatever comes back.

## Global Constraints

- **Fixtures only.** No backend changes, no new recordings, no new corpus documents, no changes to `DealAssistantPanel` or any other component.
- **Citations are never authored.** Every citation comes out of a recording through `cited()`. Only prose is written by hand.
- **Remediation is delete-only.** Condensing a recorded cell means cutting and reordering. Never add a claim, never soften a rating, never write a finding the recording did not make.
- **An affirmative false consistency is worse than a missing finding.** A prospect can open the document this demo itself serves.
- **Every `[Source N]` marker must resolve inside its own answer's dense citation list.** `AnswerText` drops an out-of-range marker silently.
- **Context isolation (CLAUDE.md invariant 2):** an answer may only cite documents belonging to the workspace it is served in.
- **Fund IV** = `brightwater_iv`. **Fund III** = `brightwater_iii`.
- **Tests:** `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts`. Full suite: `npm test`. Typecheck: `npx tsc --noEmit`.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/demo/fixtures/chat.ts` | **Modify.** All six new answers, the fund dimension, the generalised `cited()`, the relative fund-mention refusal, the new doc label. |
| `frontend/src/demo/fixtures/chat.test.ts` | **Modify.** Per-fund pins, the conflicts reversal, the fee-offset attribution guard, cross-fund citation isolation. |

Two files. The fixture is 550 lines and will land near 800; that is within what this file already does (one fixture, one responsibility) and splitting it would separate answers from the matcher that selects them.

---

## Task 1: Give the question set a fund dimension

Today `matchDemoQuestion(text)` searches every question regardless of workspace, and `demoSseStream` compensates with a hardcoded `dealId === DEMO_FUND_IV_ID` gate. With two funds that gate has to become data.

**Files:**
- Modify: `frontend/src/demo/fixtures/chat.ts`
- Test: `frontend/src/demo/fixtures/chat.test.ts`

**Interfaces:**
- Produces:
  - `DemoAnswer` gains `dealId: string`
  - `DemoPromptCard` gains `dealId: string`
  - `matchDemoQuestion(text: string, dealId: string): DemoAnswer | null`
  - `questionsFor(dealId: string): DemoAnswer[]`

- [ ] **Step 1: Write the failing tests**

Append to the `describe("matchDemoQuestion", ...)` block in `chat.test.ts`:

```ts
  it("answers only inside the workspace the question belongs to", () => {
    // Every question today is Fund IV's. Asked from Fund III, each must fall
    // back rather than cite Fund IV's DDQ, PPM and pitchbook into a workspace
    // whose context never contains them (CLAUDE.md invariant 2).
    for (const q of DEMO_QUESTIONS) {
      expect(matchDemoQuestion(q.question, q.dealId), q.question).not.toBeNull();
      const otherFund =
        q.dealId === DEMO_FUND_IV_ID ? DEMO_FUND_III_ID : DEMO_FUND_IV_ID;
      expect(matchDemoQuestion(q.question, otherFund), q.question).toBeNull();
    }
  });

  it("returns null for a workspace with no question set at all", () => {
    expect(matchDemoQuestion("what is the management fee", "no_such_deal")).toBeNull();
  });
```

Every existing call in `chat.test.ts` of the form `matchDemoQuestion("…")` now needs its fund. Add `DEMO_FUND_IV_ID` as the second argument to each — there are calls in `"never tells a prospect the documents agree on the fee terms"`, `"offers no conflicts-of-interest question at all"`, `"attaches no citation to a page that does not support its claim"`, `"answers the fee question a prospect is most likely to type"`, `"falls back on a question that names a fund the run was not recorded against"`, and every test in the `describe("matchDemoQuestion", …)` block.

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts`
Expected: FAIL — `matchDemoQuestion` takes one argument, so this is a TypeScript error surfaced as a transform failure.

- [ ] **Step 3: Add `dealId` to the interface and to all five existing questions**

In `chat.ts`, extend the interface:

```ts
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
```

Add `dealId: DEMO_FUND_IV_ID,` immediately after the `question:` line of each of the five existing entries in `DEMO_QUESTIONS`. `DEMO_FUND_IV_ID` is already imported; add `DEMO_FUND_III_ID` to that same import from `./entities` — Task 4 needs it and importing it now keeps the diff in one place.

- [ ] **Step 4: Make the fund-mention refusal relative**

Replace the `OTHER_FUND_MENTIONS` constant and its doc comment with:

```ts
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
```

- [ ] **Step 5: Parameterise the matcher**

Replace `matchDemoQuestion`'s signature and its first lines:

```ts
/** Every question belonging to a workspace. Empty for a fund with no set. */
export function questionsFor(dealId: string): DemoAnswer[] {
  return DEMO_QUESTIONS.filter((q) => q.dealId === dealId);
}

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
```

The rest of the loop body is unchanged.

- [ ] **Step 6: Make the cards and the stream fund-aware**

Extend `DemoPromptCard` and its derivation:

```ts
export interface DemoPromptCard {
  title: string;
  dealId: string;
  blurb: string;
  chips: string[];
  prompt: string;
}

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
```

In `demoSseStream`, replace the gate and its comment:

```ts
  const dealId = match[1];
  const question = questionFromBody(body);
  // Which questions answer here is now a property of the question set, not of
  // this line: a fund with no recorded material has no questions, so every
  // ask in it falls through to the honest fallback.
  const matched = matchDemoQuestion(question, dealId);
```

- [ ] **Step 7: Fix the two card tests**

`"offers one card per question, submitting the question verbatim"` calls `matchDemoQuestion(card.prompt)`. It becomes:

```ts
      expect(matchDemoQuestion(card.prompt, card.dealId)).not.toBeNull();
```

`"offers the question set in Fund IV only"` is replaced by:

```ts
  it("offers each fund only its own cards", () => {
    // A card clicked in a sibling fund could only answer off-script, or worse,
    // cite documents that workspace's context never contains (invariant 2).
    const fourth = demoPromptCardsFor(DEMO_FUND_IV_ID);
    const third = demoPromptCardsFor(DEMO_FUND_III_ID);
    expect(fourth.length).toBeGreaterThan(0);
    for (const card of fourth) expect(card.dealId).toBe(DEMO_FUND_IV_ID);
    for (const card of third) expect(card.dealId).toBe(DEMO_FUND_III_ID);
    expect(fourth.length + third.length).toBe(DEMO_PROMPT_CARDS.length);
    expect(demoPromptCardsFor("no_such_deal")).toEqual([]);
  });
```

- [ ] **Step 8: Run the suite**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. Fund III still has zero cards — Task 4 gives it three.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/demo/fixtures/chat.ts frontend/src/demo/fixtures/chat.test.ts
git commit -m "refactor(demo): key the chat question set on its workspace"
```

---

## Task 2: Resolve citations against any recording

`cited()` closes over the DDQ run through a module-level `CELL_BY_COLUMN`. Four more recordings ship; the helper needs to reach them.

**Files:**
- Modify: `frontend/src/demo/fixtures/chat.ts`
- Test: `frontend/src/demo/fixtures/chat.test.ts`

**Interfaces:**
- Consumes: `RECORDING_BY_WORKFLOW` from `@/demo/fixtures/workflowRegistry`.
- Produces: `cited(workflowId: string, columnId: string, sourceNumbers: readonly number[]): Citation[]`

- [ ] **Step 1: Write the failing test**

Append to `describe("demo chat question set", …)`:

```ts
  it("lifts citations out of whichever recording the answer came from", () => {
    // The guard against a re-recording that renumbers sources: this must throw
    // in development rather than quietly strip citations off a live screen.
    expect(() => cited(WF_ODD_SCREEN, "not-a-column", [1])).toThrow(/drifted apart/);
    expect(() => cited(WF_ODD_SCREEN, COL_ODD_CONFLICTS, [999])).toThrow(/Source 999/);
  });
```

Add to the test file's imports from `./chat`: `cited`, `WF_ODD_SCREEN`, `COL_ODD_CONFLICTS`.

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts -t "whichever recording"`
Expected: FAIL — `cited` is not exported and takes two arguments.

- [ ] **Step 3: Rewrite the helper**

In `chat.ts`, replace the `DEMO_DDQ_RUN` import:

```ts
import { RECORDING_BY_WORKFLOW } from "./workflowRegistry";
```

(`DEMO_DDQ_RUN` is no longer needed here; remove it from the `./workflows` import. If that leaves the import empty, delete the line.)

Replace the workflow-id and column-id constants block and `CELL_BY_COLUMN`/`cited` with:

```ts
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
```

Delete the old comment line about the conflicts column being deliberately unsurfaced — Task 3 replaces that decision.

- [ ] **Step 4: Update the five existing `cited()` calls**

Each existing call gains the DDQ workflow id as its first argument:

```ts
    citations: cited(WF_DDQ_SCAN, COL_TEAM, [64, 44, 56, 22]),
```

Do the same for the `COL_COMPLIANCE`, `COL_IT`, `COL_VALUATION` and `COL_TERMS` calls, leaving each call's source-number array exactly as it is.

- [ ] **Step 5: Run the suite**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts && npx tsc --noEmit`
Expected: PASS. The existing `"cites only citations the recorded run actually produced"` walker is what proves the rewrite lifted the same objects as before.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/demo/fixtures/chat.ts frontend/src/demo/fixtures/chat.test.ts
git commit -m "refactor(demo): resolve chat citations against any recording"
```

---

## Task 3: Fund IV's three new cards, and the conflicts reversal

**Files:**
- Modify: `frontend/src/demo/fixtures/chat.ts`
- Test: `frontend/src/demo/fixtures/chat.test.ts`

**Interfaces:**
- Consumes: `cited`, `WF_ODD_SCREEN`, `WF_LPA_REVIEW`, `COL_ODD_CONFLICTS`, `COL_ODD_PROVIDERS`, `COL_LPA_INDEMNITY` (Task 2).

- [ ] **Step 1: Invert the conflicts prohibition**

This is a deliberate reversal of a logged decision, so the test carries its own evidence. In `chat.test.ts`, replace the whole `it("offers no conflicts-of-interest question at all", …)` block with:

```ts
  it("answers the conflicts question by naming the affiliated broker-dealer", () => {
    // REVERSAL, 2026-08-08. This test previously asserted the opposite, on the
    // ground that "the recorded run cited every ADV page except p6 and reported
    // the manager's denial instead". That ground is gone: the ODD Screen
    // recording cites brightwater_adv_part2a.pdf p6 directly and names
    // Brightwater Securities, LLC. The fixture can now disclose what the corpus
    // discloses, which is what the prohibition existed to protect.
    const conflicts = matchDemoQuestion(
      "what conflicts of interest are disclosed",
      DEMO_FUND_IV_ID
    );
    expect(conflicts).not.toBeNull();
    expect(conflicts!.answer).toContain("Brightwater Securities");
    expect(
      conflicts!.citations.some(
        (c) => c.source_file === "brightwater_adv_part2a.pdf" && c.page === 6
      ),
      "the broker-dealer claim must cite the page that discloses it"
    ).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts -t "affiliated broker-dealer"`
Expected: FAIL — `matchDemoQuestion` returns null; there is no conflicts question yet.

- [ ] **Step 3: Add the three Fund IV answers**

Append to `DEMO_QUESTIONS`, before the closing `];`:

```ts
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
```

- [ ] **Step 4: Run the suite**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts`
Expected: PASS, **except** `"ships between five and six questions"`, which now sees eight. Leave it failing — Step 5 replaces it.

- [ ] **Step 5: Pin the counts per fund**

Replace the `it("ships between five and six questions", …)` block with:

```ts
  it("ships eight questions, all of them Fund IV's", () => {
    // Explicit rather than a range: adding a card should be a deliberate act,
    // and every card is a claim this demo makes to a prospect. Task 4 raises
    // this to eight and three once Fund III has a set.
    expect(questionsFor(DEMO_FUND_IV_ID)).toHaveLength(8);
    expect(questionsFor(DEMO_FUND_III_ID)).toHaveLength(0);
    expect(DEMO_QUESTIONS).toHaveLength(8);
  });
```

Add `questionsFor` to the test file's imports from `./chat`.

- [ ] **Step 6: Run again**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts`
Expected: PASS, whole file. This task commits green; the pin moves in Task 4.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/demo/fixtures/chat.ts frontend/src/demo/fixtures/chat.test.ts
git commit -m "feat(demo): answer conflicts, service providers and ILPA alignment in chat"
```

---

## Task 4: Fund III's first question set

Fund III's Agent tab has never had a card. Its side-letter recording is the first material honest enough to put there.

**Files:**
- Modify: `frontend/src/demo/fixtures/chat.ts`
- Test: `frontend/src/demo/fixtures/chat.test.ts`

**Interfaces:**
- Consumes: `cited`, `WF_SIDE_LETTERS`, `COL_SL_OBLIGATIONS`, `COL_SL_DEADLINES`, `COL_SL_MFN` (Task 2); `questionsFor` (Task 1).

- [ ] **Step 1: Write the failing test**

Append to `describe("demo chat question set", …)`:

```ts
  it("answers Fund III out of its own side letter, and nothing else", () => {
    for (const q of questionsFor(DEMO_FUND_III_ID)) {
      expect(q.citations.length, q.question).toBeGreaterThan(0);
      for (const citation of q.citations) {
        // Fund III's workspace contains one recorded document. Citing any
        // Fund IV file here would be a context-isolation break, not a typo.
        expect(citation.source_file, q.question).toBe("glenmoor_fund_iii_side_letter.pdf");
        expect(citation.deal_id, q.question).toBe(DEMO_FUND_III_ID);
      }
    }
  });

  it("labels the side letter for the card chips", () => {
    // Without a case the chip shows the raw filename, which is the only place
    // in the demo a visitor would ever see one.
    expect(demoDocLabel("glenmoor_fund_iii_side_letter.pdf")).toBe("Side letter");
  });
```

Add `demoDocLabel` to the test file's imports from `./chat`.

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts -t "side letter"`
Expected: FAIL — `questionsFor(DEMO_FUND_III_ID)` is empty so the first test is vacuous-but-passing, and `demoDocLabel` returns the raw filename.

- [ ] **Step 3: Add the document label**

In `demoDocLabel`'s switch, add before `default:`:

```ts
    case "glenmoor_fund_iii_side_letter.pdf":
      return "Side letter";
```

- [ ] **Step 4: Add Fund III's three answers**

Append to `DEMO_QUESTIONS`:

```ts
  {
    question: "What did we negotiate in our side letter?",
    dealId: DEMO_FUND_III_ID,
    blurb: "Every obligation in the Glenmoor side letter, by section.",
    anchors: [
      "side letter",
      "negotiate",
      "negotiated",
      "our obligations",
      "obligations",
      "what did we get",
    ],
    support: ["letter", "commitment", "terms", "glenmoor", "rights"],
    answer:
      "The Glenmoor side letter to Brightwater Capital Partners III carries eight " +
      "obligations:\n\n" +
      "- Management fee reduction of **ten basis points per annum** on Glenmoor's " +
      "$25,000,000 commitment (Section 1) [Source 1]\n" +
      "- **MFN election right** for terms granted to Limited Partners committing " +
      "$50,000,000 or less (Section 2) [Source 1]\n" +
      "- Pro-rata **co-investment** opportunity for investments requiring more than " +
      "$75,000,000 of aggregate equity capital (Section 3) [Source 2]\n" +
      "- **Quarterly reports** within 45 days after quarter-end (Section 4) [Source 2]\n" +
      "- **Annual audited financials** within 120 days after fiscal year-end " +
      "(Section 4) [Source 2]\n" +
      "- **Excuse right** for tobacco or controlled substances, on ten business days' " +
      "written notice (Section 5) [Source 3]\n" +
      "- Consent to **affiliate transfers** not to be unreasonably withheld (Section 6) " +
      "[Source 3]\n" +
      "- **Annual ESG report** covering portfolio-level metrics (Section 7) [Source 4]",
    // Side letter p1, p2, p3, p4.
    citations: cited(WF_SIDE_LETTERS, COL_SL_OBLIGATIONS, [1, 2, 3, 4]),
  },
  {
    question: "What are our deadlines, and what triggers them?",
    dealId: DEMO_FUND_III_ID,
    blurb: "The clock on each obligation, who owns it, and what starts it running.",
    anchors: [
      "deadline",
      "deadlines",
      "trigger",
      "triggers",
      "due date",
      "how long do we have",
      "45 days",
      "30 days",
    ],
    support: ["timing", "notice", "owner", "quarterly", "annual"],
    answer:
      "- **MFN election** — within 30 days after final close, triggered by a better " +
      "term being granted to an LP committing $50M or less. Glenmoor's to exercise " +
      "[Source 1]\n" +
      "- **Co-investment offer** — commercially reasonable efforts, triggered by an " +
      "investment requiring more than $75M of aggregate equity. General Partner " +
      "[Source 2]\n" +
      "- **Quarterly reports** — within 45 days after each quarter-end. General Partner " +
      "[Source 2]\n" +
      "- **Annual audited financials** — within 120 days after fiscal year-end. General " +
      "Partner [Source 2]\n" +
      "- **Excuse-right notice** — at least 10 business days before an investment in " +
      "tobacco or controlled substances. Glenmoor's to give [Source 3]\n" +
      "- **Annual ESG report** — annually, no stated trigger. General Partner [Source 4]",
    // Side letter p1, p2, p3, p4.
    citations: cited(WF_SIDE_LETTERS, COL_SL_DEADLINES, [1, 2, 3, 4]),
  },
  {
    question: "What does our MFN actually cover?",
    dealId: DEMO_FUND_III_ID,
    blurb: "Scope, election window and carve-outs on the most-favoured-nations right.",
    anchors: ["mfn", "most favored nation", "most favoured nation", "better terms"],
    support: ["election", "scope", "carve", "commitment", "threshold"],
    // The recorded cell's "Notice deadlines" row is empty; it is dropped rather
    // than filled in, because nothing in the document supports a value.
    answer:
      "**Scope:** better economic, reporting, transfer or governance terms granted to " +
      "any Limited Partner committing $50,000,000 or less [Source 1].\n\n" +
      "**Election mechanics:** exercisable within 30 days after final close " +
      "[Source 1].\n\n" +
      "**Carve-outs:** subject to customary exclusions [Source 1] — the side letter " +
      "does not enumerate them, and the extraction reports no notice-deadline term.",
    // Side letter p1.
    citations: cited(WF_SIDE_LETTERS, COL_SL_MFN, [1]),
  },
```

- [ ] **Step 5: Raise the count pin to both funds**

Task 3 pinned eight questions, all Fund IV's. Replace that block with:

```ts
  it("ships eight questions on Fund IV and three on Fund III", () => {
    // Explicit rather than a range: adding a card should be a deliberate act,
    // and every card is a claim this demo makes to a prospect.
    expect(questionsFor(DEMO_FUND_IV_ID)).toHaveLength(8);
    expect(questionsFor(DEMO_FUND_III_ID)).toHaveLength(3);
    expect(DEMO_QUESTIONS).toHaveLength(11);
  });
```

- [ ] **Step 6: Run the suite**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts && npx tsc --noEmit`
Expected: PASS, whole file.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/demo/fixtures/chat.ts frontend/src/demo/fixtures/chat.test.ts
git commit -m "feat(demo): give Fund III a question set from its side letter"
```

---

## Task 5: The fee-offset attribution guard

The fee-offset contradiction has produced a bad citation twice — once in the LPA/ILPA recording that was caught and re-rolled, once in the ODD Screen cell this plan condenses. The fixture must not inherit it a third time.

**Files:**
- Modify: `frontend/src/demo/fixtures/chat.test.ts`

**Interfaces:**
- Consumes: `DEMO_QUESTIONS`, `matchDemoQuestion` (Tasks 1, 3, 4).

- [ ] **Step 1: Write the guard**

Replace the existing `it("never tells a prospect the documents agree on the fee terms", …)` block with:

```ts
  it("never tells a prospect the documents agree on the fee terms", () => {
    // The DDQ's own p7 answers "100% of such fees", against the 50% offset in
    // the LPA and PPM, and the recorded run cited neither p7 nor the mismatch.
    // Repeating the recording's "consistent" conclusion would convert a silent
    // miss into an active false statement — worse in front of an LP, who can
    // open the DDQ this demo itself ships and see the contradiction.
    const terms = matchDemoQuestion("what is the fee offset", DEMO_FUND_IV_ID);
    expect(terms).not.toBeNull();
    expect(terms!.answer).not.toMatch(/consistent/i);
    const prose = DEMO_QUESTIONS.map((q) => `${q.question} ${q.answer}`).join(" ");
    expect(prose).not.toMatch(/terms are consistent/i);
  });

  it("never cites the page that refutes a fee-offset figure it states", () => {
    // This has now gone wrong twice in recordings: an answer states 50% and
    // cites brightwater_iv_ddq.pdf p7 as support, but p7 reads "100% fee
    // offset". The claim is right and the attribution is not, so a prospect
    // clicking the chip lands on the page that contradicts the sentence above
    // it. Mechanical citation checks miss this entirely — the citation
    // resolves. This is the narrow pin for the one contradiction the corpus
    // deliberately plants.
    for (const q of DEMO_QUESTIONS) {
      const statesOffsetFigure = /\b(50|100)\s?%[^.]{0,60}offset|offset[^.]{0,60}\b(50|100)\s?%/i.test(
        q.answer
      );
      if (!statesOffsetFigure) continue;
      const citesDdqPage7 = q.citations.some(
        (c) => c.source_file === "brightwater_iv_ddq.pdf" && c.page === 7
      );
      expect(
        citesDdqPage7,
        `"${q.question}" states a fee-offset figure while citing DDQ p7, which ` +
          "states the opposing figure"
      ).toBe(false);
    }
  });
```

- [ ] **Step 2: Run it**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts -t "refutes a fee-offset"`
Expected: PASS. The guard is satisfied because Task 3 deleted that sentence from the conflicts answer.

- [ ] **Step 3: Prove the guard has teeth**

A guard that passes on the first run may be vacuous. Temporarily append `" The fund provides a 50% fee offset [Source 1]."` to the conflicts answer's `answer` string and change its `cited` call to `cited(WF_ODD_SCREEN, COL_ODD_CONFLICTS, [32, 68, 72, 33, 27])`.

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts -t "refutes a fee-offset"`
Expected: **FAIL**, naming the conflicts question.

Revert both edits and re-run to confirm PASS. Do not commit the mutation.

- [ ] **Step 4: Add cross-fund citation isolation**

Append to `describe("demo chat question set", …)`:

```ts
  it("cites only documents belonging to the fund it answers in", () => {
    const CORPUS: Record<string, RegExp> = {
      [DEMO_FUND_IV_ID]: /^brightwater_(iv_|adv_|valuation_|track_)/,
      [DEMO_FUND_III_ID]: /^glenmoor_fund_iii_/,
    };
    for (const q of DEMO_QUESTIONS) {
      const pattern = CORPUS[q.dealId];
      expect(pattern, `no corpus pattern for ${q.dealId}`).toBeDefined();
      for (const c of q.citations) {
        expect(c.source_file, `${q.question} cites outside its fund`).toMatch(pattern);
        expect(c.deal_id, q.question).toBe(q.dealId);
      }
    }
  });
```

- [ ] **Step 5: Run the whole chat suite**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/demo/fixtures/chat.test.ts
git commit -m "test(demo): pin fee-offset attribution and cross-fund citation isolation"
```

---

## Task 6: Verify and sweep

**Files:** none modified unless a check fails.

- [ ] **Step 1: Full suite, typecheck, build**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run build
```
Expected: all green. Note the entry chunk size from the build output and compare it against `210.99 kB` — the chat fixture is behind `DealAssistantPanel`'s dynamic `import("@/demo/fixtures/chat")`, so **the entry chunk must not grow**. If it did, a static import leaked the fixture into it.

- [ ] **Step 2: Lint the touched paths**

```bash
cd frontend && npm run lint
```
Expected: zero errors, and zero warnings in `src/demo/**`. The repo carries ~49 pre-existing warnings elsewhere; do not fix them here.

- [ ] **Step 3: Drive both funds in a browser**

Start the dev server (the demo needs no backend):

```bash
cd frontend && npm run dev -- --port 5199 --strictPort
```

Visit `http://localhost:5199/demo`, then open each workspace's **Agent** tab.

On **Brightwater Capital Partners IV** (`/deal/brightwater_iv`): eight cards. Click *What conflicts of interest are disclosed?* — the answer must name Brightwater Securities and its citation chips must open the Document Viewer on `brightwater_adv_part2a.pdf` page 6. Click *Who are the fund's service providers?* and confirm "Not found" renders as text, not as an error.

On **Brightwater Capital Partners III** (`/deal/brightwater_iii`): three cards, where there were none. Click each; every citation chip must open `glenmoor_fund_iii_side_letter.pdf`.

Then type `what is the management fee for Fund IV?` **in Fund III** and confirm it returns the off-script fallback rather than Fund IV's 2.0%.

Two gotchas that look like bugs and are not: the **Ask** button submits, Enter does not; and the workspace restores the last tab used, so the Agent tab may not be on screen when you arrive.

- [ ] **Step 4: Stop the dev server**

```bash
# PowerShell
$p = (Get-NetTCPConnection -LocalPort 5199 -State Listen).OwningProcess; Stop-Process -Id $p -Force
```

- [ ] **Step 5: Update the spec's status and commit**

Set the spec header's `**Status:**` to `Implemented`.

```bash
git add docs/superpowers/specs/2026-08-08-demo-chat-more-questions-design.md
git commit -m "docs(demo): mark the chat question-set spec implemented"
```

---

## Deviations from the spec, deliberate

- **The spec lists "Where does the LPA lean GP-favorable?" as drawing on two cells** (indemnification and fiduciary-duty modifications). Both cells quote the *same* Section 17 clause and cite the same `[Source 17]`, so the answer draws citations from the indemnification cell alone and says the fiduciary column returns the same rating on the same clause. Citing one page twice as if it were two findings would overstate what the run found.
- **The spec's risk note offers to cut the service-providers card if eight crowds Fund IV's empty state.** The plan ships all three; the layout is a grid that already handles five, and cutting on speculation is harder to reverse than cutting after seeing it.

# More Demo Chat Questions, and a Question Set for Fund III

**Date:** 2026-08-08
**Status:** Implemented — eleven questions ship, eight on Fund IV and three on Fund III, which had none before. Verified in a browser: the conflicts answer names the affiliated broker-dealer and cites ADV p.6, every Fund III citation resolves to the Glenmoor side letter, and a Fund IV question asked inside Fund III returns the off-script fallback rather than Fund IV's economics.
**Scope:** Widen the demo's Agent-tab question set from five cards to eleven, and give Fund III its first question set. Frontend fixtures only — no backend changes, no new recordings, no new corpus documents.
**Builds on:** `2026-08-06-demo-more-lp-workflows-design.md` (PR #127). The four recordings it added are the entire source of new material here.

## Goal

The demo's Agent tab answers five questions, all condensed from the recorded DDQ Gap & Consistency Scan. Four more recordings now exist — Fund Terms, ODD Screen, LPA / ILPA-Alignment Review and Side Letters — carrying 68 citations of material chat has never drawn on. Two consequences:

1. **Fund IV's question set understates what the demo can prove.** Three topics an allocator asks first — conflicts of interest, service providers, and where the LPA leans GP-favorable — are answerable from recordings that shipped last week.
2. **Fund III's Agent tab is a dead end.** `demoPromptCardsFor` returns `[]` there and `demoSseStream` refuses every question, because until Side Letters was recorded against `brightwater_iii` there was nothing honest to say. There is now.

Non-goals: no new recordings, no live model at demo time, no changes to the doc-matrix surface (it stays switched off — see `MatrixAskHero`'s demo branch), no change to the off-script fallback's wording.

## What already exists

`frontend/src/demo/fixtures/chat.ts` (550 lines) holds the whole mechanism:

- `DEMO_QUESTIONS: DemoAnswer[]` — five entries, each with `question`, `blurb`, `anchors`, `support`, hand-condensed `answer` prose, and `citations`.
- `cited(columnId, sourceNumbers)` — lifts recorded `Citation` objects out of `DEMO_DDQ_RUN` by their `[Source N]` number and renumbers them densely. **Citations are never authored**, only the prose is. Throws on drift.
- `matchDemoQuestion(text)` — anchor/support matching, deliberately tight: a broad topic word never selects an answer alone.
- `DEMO_PROMPT_CARDS` / `demoPromptCardsFor(dealId)` — the empty-state cards, with source chips derived from each answer's own citations.
- `demoSseStream` — token-by-token replay, gated to Fund IV.

Its two standing rules carry forward unchanged and are not up for revision:

- **Remediation is delete-only.** A weak sentence is dropped, never rewritten. Never present a finding the fixture does not contain.
- **An affirmative false consistency is worse than a missing finding**, because a prospect can open the document this demo itself serves and see the contradiction.

## The decision this reverses

`chat.test.ts:108` — `"offers no conflicts-of-interest question at all"` — is a reasoned prohibition, not an oversight. Its stated ground:

> Form ADV p6 discloses Brightwater Securities, LLC — an affiliated broker-dealer that "may receive transaction fees". The recorded run cited every ADV page except p6 and reported the manager's denial instead, so every conflicts question is a landmine no rephrasing defuses.

**That ground is now obsolete.** The ODD Screen recording's Conflicts-of-interest cell cites `brightwater_adv_part2a.pdf` p.6 directly and states: *"Brightwater Securities, LLC, an affiliated broker-dealer, may receive transaction fees or placement-related compensation."* The fixture can now disclose what the corpus discloses, which is precisely what the prohibition existed to prevent it from failing to do.

The reversal must be explicit: the test is rewritten into its inverse — *the conflicts answer must name the affiliated broker-dealer and cite ADV p.6* — with the new evidence recorded in the comment. It is not deleted.

**One sentence of that cell must be dropped.** It reads:

> "…with **50%** of these fees offsetting the management fee `[Source 6][Source 27][Source 58]`"

`[Source 27]` resolves to `brightwater_iv_ddq.pdf` p.7, whose text is *"the Fund provides a **100%** fee offset"*. The claim is correct (the LPA governs and says 50%), but it presents the corpus's planted contradiction as corroboration — a prospect clicking that chip lands on a page refuting the sentence above it. Dropping the sentence is condensation under the delete-only rule. The defect in the recording itself is out of scope here and tracked separately (see Open Items).

## Design

### 1. A fund dimension

Every part of the fixture that assumes Fund IV gains a deal id.

- `DemoAnswer` gains `dealId: string`.
- `matchDemoQuestion(text, dealId)` considers only that fund's questions. A Fund III question asked inside Fund IV must fall back, and vice versa.
- `OTHER_FUND_MENTIONS` becomes **relative to the asking workspace**. Today it is a fixed list that refuses any mention of Funds I–III, which is correct only from inside Fund IV. Inside Fund III, "Fund III" must be answerable and "Fund IV" must refuse.
- `demoSseStream`'s gate changes from `dealId === DEMO_FUND_IV_ID` to "this deal has a question set", so adding a fund is data, not a branch.
- `demoPromptCardsFor(dealId)` already takes the deal id; it filters the widened set instead of special-casing Fund IV.

The isolation property is unchanged and load-bearing (CLAUDE.md invariant 2): an answer may only cite documents belonging to the workspace it is served in.

### 2. `cited()` resolves against any recording

`cited` currently closes over `DEMO_DDQ_RUN` through a module-level `CELL_BY_COLUMN`. It becomes `cited(workflowId, columnId, sourceNumbers)`, resolving the run through `RECORDING_BY_WORKFLOW` from `workflowRegistry.ts`. Throw-on-drift behaviour is unchanged — a re-recording that renumbers sources must fail a test in development, never silently strip citations off a prospect's screen.

Column ids are stable across startup reconciliation (CLAUDE.md invariant 4), so they may be written as constants, as the existing five already are:

| Recording | Column | Column id |
|---|---|---|
| ODD Screen | Conflicts of interest | `c0ee1cfab63f474b9fb58a484d39c63c` |
| ODD Screen | Service providers | `f4a0afc4a62e453595b1570b444fb4fe` |
| LPA / ILPA | Indemnification & exculpation scope | `bc3b63ca80b846428f0cea876b1a9e4d` |
| LPA / ILPA | Fiduciary-duty modifications | `e1781d00088f4c1c860b601292910afc` |
| Side Letters | Obligations list | `36d71bb878af4ae0a5ef3d273226c7e6` |
| Side Letters | Deadlines & triggers | `504c0842b45848d191ab7d4a4b46218f` |
| Side Letters | MFN provision | `c1c656b232504d08a445e5e0121511f3` |

### 3. The cards

Six new, eleven total.

**Fund IV (5 → 8)**

| Question | Source cell | Material |
|---|---|---|
| What conflicts of interest are disclosed? | ODD · Conflicts of interest | Affiliated broker-dealer (ADV p.6), advisory-committee and allocation process, broken-deal expense allocation. **Fee-offset sentence deleted.** |
| Who are the fund's service providers? | ODD · Service providers | Auditor, administrator, fund counsel — and "Custodian: Not found" kept verbatim, because expressing absence is exactly the capability the `require_citations` fix restored |
| Where does the LPA lean GP-favorable? | LPA/ILPA · Indemnification, Fiduciary-duty modifications | Both rated GP-favorable by the run, quoting the "fullest extent permitted by law" indemnity |

**Fund III (0 → 3)**

| Question | Source cell | Material |
|---|---|---|
| What did we negotiate in our side letter? | Side Letters · Obligations list | 10bps fee reduction, MFN, co-invest, reporting, transfer consent, ESG, excuse rights |
| What are our deadlines, and what triggers them? | Side Letters · Deadlines & triggers | MFN election within 30 days of final close; quarterly reports within 45 days; annual audited within 120 days |
| What does our MFN actually cover? | Side Letters · MFN provision | Better economic, reporting, transfer or governance terms granted to any LP committing $50M or less |

Fund III sits in Monitoring stage, so obligations and deadlines are the right register for it — not a second diligence workspace.

### 4. Prose condensation

Recorded cells are grid-shaped: LPA/ILPA cells open with a bare enum (`Market"…quote…" **Analysis:**`), Side Letters' deadlines cell is a markdown table. Condensation into chat prose is hand-written, under the delete-only rule — cut and reorder, never add a claim or soften a rating. Every `[Source N]` marker in the finished prose must resolve inside that answer's own dense citation list.

## Testing

Extend `frontend/src/demo/fixtures/chat.test.ts`.

**Changed:**
- The count pin (`"ships between five and six questions"`) becomes explicit per fund: eight questions on Fund IV, three on Fund III, eleven total. A range invites silent drift; the point of the pin is that adding a card is a deliberate act.
- `"offers the question set in Fund IV only"` becomes per-fund: Fund IV serves its eight, Fund III its three, and neither serves the other's.
- `"offers no conflicts-of-interest question at all"` is **inverted**: the conflicts answer must name Brightwater Securities and carry a citation to `brightwater_adv_part2a.pdf` p.6, with the reversal's evidence in the comment.

**New:**
- **Fee-offset attribution guard** (generalises the hand-written `chat.test.ts:122` case): no answer may state a fee-offset percentage while carrying a citation to `brightwater_iv_ddq.pdf` p.7, and no answer may assert that the documents agree on fees. This is the class of defect that has now occurred twice in recordings; the fixture must not inherit it.
- **Per-fund matcher isolation**: a side-letter question asked inside Fund IV falls back off-script, and a Fund IV question asked inside Fund III does the same.
- **Cross-fund citation isolation**: every answer's citations name documents belonging to its own `dealId`.
- The existing shape walkers (dense `[Source N]` numbering, real filenames, real pages) extend to the new answers with no change — they already iterate `DEMO_QUESTIONS`.

## Risks

- **The reversal is the risk.** If any new answer implies the manager has no conflicts, it is worse than the prohibition it replaces. The mitigation is that the answer is condensed from a cell that names the broker-dealer and cites the page.
- **Eight cards may crowd Fund IV's empty state.** Layout is unchanged; if eight reads as a wall, cut the service-providers card first — it is the least load-bearing of the three.
- **`OTHER_FUND_MENTIONS` becoming relative is the subtlest change here.** Getting it backwards would let a Fund III workspace answer about Fund IV's economics using Fund IV's LPA — a context-isolation break, not a cosmetic one. It needs a test per direction.

## Open items, not in scope

1. **The ODD Screen recording ships a citation-fidelity defect** (the `[Source 27]` attribution above). This spec routes around it by deletion; the recording itself is untouched. Deciding what to do about it — re-record, or accept and document — belongs with PR #127's open item on claim-vs-page fidelity.
2. Nothing checks claim-vs-page fidelity in general. The fee-offset guard above is a targeted pin for the one contradiction the corpus plants, not a solution.

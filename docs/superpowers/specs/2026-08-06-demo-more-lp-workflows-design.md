# More LP Workflows in the Demo

**Date:** 2026-08-06
**Status:** Implemented — all four recordings shipped, so five of the eight built-ins run in the demo and three refuse permanently (Fund Brief, Track Record Grid, Fund Commitment Memo).

> **One deviation from the scope below.** Getting the four recordings needed a **backend fix**, not just frontend work. All four were rejected on the first attempt with permanently blank cells; the cause was cosmetic citation-stripping in `citations.py` discarding grounded answers, and a truthful "not found" being unable to survive `require_citations` at all. That is a real product defect — an absent clause was indistinguishable from a failed extraction for every user, not just the demo — so it was fixed rather than worked around. Re-recorded against the fixed backend, every run completed in a single pass with no retries.

**Scope:** Extend demo mode from one runnable workflow to five, and list the full LP built-in catalogue. Frontend-only, no backend changes.
**Builds on:** `2026-08-03-demo-mode-odd-design.md` (PR #126, branch `feat/demo-mode-odd`). The fixture transport, replay engine and coverage guard this spec extends exist only there.

## Goal

A visitor exploring the demo today finds one workflow. The product ships eight for fund workspaces. Close that gap: list all eight, and let five of them run.

The framing stays **operational due diligence for LP firms**. The four workflows added are the ones an allocator's ODD and legal review actually run — the operational screen itself, the terms that govern the relationship, the LPA clauses measured against ILPA, and the per-LP side-letter promises that have to be verified every quarter.

Runs remain fixed: the same input produces the same output every time, because every run is a **recording** of a real model pass, frozen and replayed.

Non-goals: no backend changes, no LLM at demo time, no assistant-type (multi-stage) workflow support, no new corpus documents.

## What already exists

**Eight LP built-ins** (`backend/app/services/workflow_seed_lp.py:313`), all `entity_type="fund"`:

| Built-in | Type · row source | Shape |
|---|---|---|
| DDQ Gap & Consistency Scan | tabular · multi_doc_synthesis | 12 markdown columns |
| Fund Brief | tabular · multi_doc_synthesis | 11 columns; drives the Brief tab |
| Track Record Grid | tabular · **one_doc_per_row** | 11 typed columns + a derived TVPI reconciliation formula |
| Fund Terms Extractor | tabular · multi_doc_synthesis | 12 columns incl. a waterfall enum |
| ODD Screen | tabular · multi_doc_synthesis | 8 columns, Clean/Monitor/Red-flag enum |
| LPA / ILPA-Alignment Review | tabular · multi_doc_synthesis | 8 columns, LP-favorable/Market/GP-favorable/Silent enum |
| Side Letter Obligation Extractor | tabular · **one_doc_per_row** | 6 columns |
| Fund Commitment Memo | **assistant** · 4 stages | checkpoints, Word output |

**A real fund workspace lists all of them.** `workflow_store.py:87-94` filters built-ins by the deal's `entity_type`, so both demo funds would show all eight. The demo returns exactly one (`fixtures/workflows.ts:181`), understating the product by seven.

**The demo is single-recording throughout.** Three places assume there is only ever one run:

- `fixtures/workflows.ts:204` — `POST .../workflows/:id/runs` arms the replay **without reading which workflow it is for**. Add a second workflow without changing this and pressing Run on it replays the DDQ scan.
- `runReplay.ts:6` imports `DEMO_DDQ_RUN` and `DEMO_DDQ_WORKFLOW` directly.
- `fixtures/workflows.ts:36-49` hand-transcribes the DDQ template: 12 column ids copied from the seeded database, plus a `columnPrompt()` restating the backend's prompt string.

**The corpus.** Fund IV (`brightwater_iv`) holds 7 documents — LPA, DDQ, PPM, pitchbook, Form ADV Part 2A, valuation policy, track record. Fund III (`brightwater_iii`) holds 6 — side letter, PCAP, quarterly report, audited financials, capital call, distribution notice. Ids and page counts are in `fixtures/entities.ts:71-87`.

## Design

### Record the catalogue, do not transcribe it

Freeze the real `GET /deals/brightwater_iv/workflows` response as `fixtures/recorded-workflows.json`: eight templates with their real column ids and real prompts. Both funds share `entity_type="fund"`, so one dump serves both.

Hand-mirroring eight templates would mean roughly ninety copied column ids and eight prompt builders drifting silently from `workflow_seed_lp.py`. Recording is the same principle the run fixtures already rest on: recording rather than authoring is what makes it correct by construction.

**This replaces existing committed work.** `DEMO_DDQ_WORKFLOW` stops being a hand-built object and becomes a catalogue lookup; `DDQ_COLUMNS` and `columnPrompt()` are deleted. Behaviour is unchanged if the recording matches the transcription — and the field-by-field walker in `workflows.test.ts` is what proves it rather than asserting it.

### A registry replaces the module-level singletons

```
DEMO_CATALOGUE:   Workflow[]                          // all 8, from recorded-workflows.json
DEMO_RECORDINGS:  Map<workflowId, { dealId, run, queued }>   // 5 entries
byRunId:          Map<runId, recording>               // for /api/runs/:id and the replay
```

`queued` is derived from `run` exactly as `DEMO_DDQ_RUN_QUEUED` is today — same grid, no answers — so the shape never changes mid-animation.

### Route changes

All in `fixtures/workflows.ts`:

| Route | Behaviour |
|---|---|
| `GET .../workflows` | `DEMO_CATALOGUE` (was: the single DDQ workflow) |
| `GET .../workflows/:id` | catalogue lookup; unknown id 404s |
| `GET .../workflows/:id/runs` | the recording when its `dealId` matches the requested deal, else `[]` |
| `POST .../workflows/:id/runs` | arm **that workflow's** recording when the deal matches; otherwise refuse |
| `GET /api/runs/:id` | `byRunId` lookup |

The runs route keyed by `dealId` is what makes Side Letters show a run on Fund III and nothing on Fund IV — context isolation as the product enforces it, not as a special case.

### Replay becomes parameterised

`replayDemoRun(runId, onEvent)` resolves its recording from the run id, which is already available at the only call site (`lib/workflows.ts:408`). The arm keeps its existing job — separating "the visitor just pressed Run" from "opened from history" — and no longer has to carry identity as well.

Everything else in `runReplay.ts` is unchanged: it already derives the schedule, the concurrency overlap and the column-drift guard from the recording's own timestamps, so it works for any run without modification.

### Fund III gets a workflow of its own

Side Letter Obligations is recorded against `glenmoor_fund_iii_side_letter.pdf` alone. `one_doc_per_row` builds a row per document passed in, so passing all six would yield six rows, five of them "Not found". Choosing one document is what the Run dialog is for — it is using the product, not staging it.

## Recording procedure

`scripts/record_demo_run.mjs` currently hardcodes `DEAL_ID = "brightwater_iv"` and a two-entry output map. It becomes a per-workflow config:

| Workflow | Deal | Documents | Rows |
|---|---|---|---|
| ODD Screen | `brightwater_iv` | all 7 | one-click (1 row) |
| Fund Terms Extractor | `brightwater_iv` | all 7 | one-click (1 row) |
| LPA / ILPA-Alignment Review | `brightwater_iv` | all 7 | one-click (1 row) |
| Side Letter Obligations | `brightwater_iii` | side letter only | `one_doc_per_row` → 1 row |

Plus a `--catalogue` mode writing `recorded-workflows.json`.

One-click means `synthesis_questions: []`, letting the backend default the single row label to the workflow name (`routes_workflow_runs.py:116-120`). Supplying custom rows has been tried twice and is a trap: `multi_doc_synthesis` feeds each row key to the model **as the question** (`workflow_run_executor.py:298`), and rows naming a document subset push the model to answer from documents lacking the material, producing uncited prose that `extraction_engine.py:78-79` then correctly discards.

**Prerequisites, each time:** backend running from `backend/.venv`; `GEMINI_API_KEY` in `backend/.env` (not the repo root); and a backup of `backend/data/vyntic.db`, because recording persists runs to the dev database.

## The honesty gate

Applied to each recording before it ships:

1. **Every citation resolves** to a real page of a document the demo actually serves — checked by test, against the page counts in `entities.ts`, not by eye.
2. **No sentence asserting cross-document agreement the corpus contradicts.** Fund Terms is the exposed one: the fee offset is a planted 100%-versus-50% conflict, and a prospect can open the DDQ and read page 7. An affirmative false consistency is worse than a missing finding.
3. **Remediation is delete-only.** A weak cell is dropped, never rewritten. Deleting a sentence is condensation; adding one is invention.
4. **A recording too thin to ship moves to the refusal list instead.** This is the escape hatch for ODD Screen, which has recorded thin twice already (see Risks).

## Refusals

Two kinds, each naming what the live product does rather than falling through to the generic "Not available in demo" band:

**Unrecorded built-ins** — Fund Brief, Track Record Grid, Fund Commitment Memo. Each refusal describes the workflow's real output, because a prospect reading it is deciding whether the product does that at all.

**Wrong-fund runs** — the catalogue lists all eight on both funds, so pressing Run on ODD Screen from Fund III has to answer. The wording turns the refusal into navigation:

> This screen is recorded against Brightwater Fund IV — open that workspace to watch it run.

On Fund III that means seven of eight workflows refuse. That is the accepted cost of listing the real catalogue; the alternative is a demo whose workflow list contradicts the product's.

## Testing

- **`coverage.test.ts`** — reads for each new workflow and run id on both funds; refusals for the three unrecorded built-ins and for wrong-fund runs. The existing "still starts a run rather than refusing it" pin becomes one per recorded workflow.
- **`runReplay.test.ts`** — parameterised over recordings, with the assertion the registry exists to protect: **arming workflow A never plays workflow B's run.**
- **`workflows.test.ts`** — the field-by-field walker and the citation walker run over every recording, not only the DDQ one.
- **Catalogue test (new)** — every workflow in `recorded-workflows.json` resolves to either a recording or a refusal. A ninth built-in appearing in the backend then fails the build instead of shipping as a dead button.

## Risks

**ODD Screen may record thin a third time.** It has failed a content gate twice: its column prompts never ask for contradictions, and three of its eight columns are thin in this corpus. Both failures were judged as the demo's centrepiece, a bar it no longer has to clear — an honest Monitor/Monitor with citations demonstrates what ODD screening looks like. But the gate above may still reject it, in which case this work ships three new workflows rather than four.

**Bundle size.** The DDQ recording is roughly 126 kB of JSON. Four more could add 200–300 kB to the demo chunk. It is dynamically imported, so only demo visitors pay it, but the entry chunk should be measured before and after rather than assumed unchanged.

**Recording writes to the dev database.** Back it up before each run.

## Out of scope

- The assistant-type Fund Commitment Memo. Stages, checkpoints, analyst-editable outputs and Word export are a different surface, not a longer grid, and would need a second replay mechanism.
- Fund Brief. It overlaps the Brief tab, which is already fixtured through the findings and brief-overrides routes.
- Track Record Grid. Investment diligence rather than operational, and its derived-formula column is a third grid behaviour again.

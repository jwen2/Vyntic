# Typography Phase 2 — Reflow Spike Findings

**Spike:** `docs/superpowers/plans/2026-07-26-typography-phase2-spike.md`
**Change measured:** `--sans` font-family swap, IBM Plex Sans → Hanken Grotesk, applied to `body` + the three page-root inline-style overrides (`DealWorkspacePage.tsx`, `HomePage.tsx`, `ManagerPage.tsx`).
**Method:** `frontend/scripts/measure-reflow.mjs` (Playwright, Edge headless), before/after screenshots + per-row/cell `height`/`width`/`overflowing` metrics for 4 screens × 2 themes = 8 combos. Raw data: `frontend/.reflow-snapshots/{before,after}/` (gitignored, not committed).

**Run history:** `before` was captured twice. The first capture (Task 2) had unsettled RunTable content (see "RunTable" section below for why re-running didn't fix it). This doc's numbers are from the second `before` capture, diffed against a single `after` capture.

## Headline result

**FinancialPanel and TabularEditor: zero reflow.** Every one of their 66 (financial-panel) and 40 (tabular-editor) row/cell elements matched before→after with **0px** height or width change, in both themes. Confirmed visually — the two screenshots are pixel-indistinguishable. **Zero overflow flips anywhere in the entire 8-combo sweep.**

**DocMatrixTable: small but real column-width drift (4–21px) on its embedded metric tables**, plus a methodology problem (see below) that makes its answer-text height comparisons unreliable.

**RunTable: not meaningfully measurable by this script.** Both before and after captures raced a fresh, actively-streaming extraction run and caught it mid-load. This is a script defect, not a font-swap finding — see below.

## Per-screen × theme detail

### FinancialPanel — light

66/66 elements matched by (tag, text). **0 deltas > 2px, 0 overflow flips.** All financial figures (`$24.1M`, `+$10.5M (+33.3%)`, etc.) render at identical cell dimensions before/after. Visual diff: screenshots are identical pixel-for-pixel to the eye — no observable difference.

### FinancialPanel — dark

Same: 66/66 matched, **0 deltas, 0 overflow flips.**

FinancialPanel appears to render its numeric columns in a fixed/mono-leaning style that Hanken Grotesk doesn't perturb — consistent with it likely using `.font-mono-dm`/tabular figures for the number columns rather than `--sans` for cell content, and the `Metric` label column apparently not being width-sensitive to the font swap either (no delta on the "Metric"/"Revenue"/etc. row-label cells).

### TabularEditor — light

40/40 matched, **0 deltas, 0 overflow flips.** This screen (QofE Bridge clone, populated with loading-skeleton placeholder bars, not real text — see script L268-270) has almost no real rendered text to reflow: column headers (`Document`, `Period`, `Reported EBITDA$`, etc.) are identical width/height before and after.

### TabularEditor — dark

Same: 40/40 matched, **0 deltas, 0 overflow flips.**

### DocMatrixTable — light

65/65 total elements in both captures, but **only 58/65 matched by identical text** — 7 elements differ because the underlying LLM-generated DocMatrix answer is not byte-identical between the `before` and `after` runs (see "Methodology problem" below). This is a content-drift artifact, not a font-reflow signal, and is called out explicitly per-row below.

Deltas on elements that **did** match with identical text (i.e., genuine font-attributable comparisons):

| Element | Before | After | Δ |
|---|---|---|---|
| `th` "Metric" (2nd embedded metric table) | 139×33 | 127×33 | **width −12px** |
| `th` "YoY Δ" | 155×33 | 159×33 | **width +4px** |
| `td` "Revenue ($M)" (row label) | 139×31 | 127×31 | **width −12px** |
| `td` "+$10.5M (+33.3%)" | 155×31 | 159×31 | **width +4px** |
| `td` "Investment Insight:" | 166×31 | 169×31 | **width +3px** |

No height deltas, no overflow flips. Column widths shift ±3–12px — consistent with Hanken Grotesk's slightly different average glyph width vs IBM Plex Sans, redistributed by the table's auto-layout. Nothing overflows or wraps differently.

Content-drift-only rows (not comparable, excluded from the delta table above): `before` extracted a "YoY Growth (%)" row from `acme_saas_cim.pdf`; `after` extracted an "ARR ($M)" row instead — different metric, same table shape. Also: the narrative summary paragraph text differs verbatim between runs (confirmed by direct screenshot comparison — see Methodology section).

### DocMatrixTable — dark

**Row-count mismatch: 76 elements (before) vs 64 elements (after).** Per the plan's own instruction ("Row count mismatches would indicate something crashed rather than reflowed — re-run before trusting"), this was investigated directly via screenshot comparison. It is **not a crash** — it's the same non-deterministic-regeneration issue as the light-theme run, more pronounced: `before`'s answer for `acme_saas_cim.pdf` included 4 metric rows (Revenue, YoY Growth, EBITDA, EBITDA Margin) plus a longer narrative; `after`'s answer for the same document/question included only 2 metric rows (Revenue, YoY Growth) plus a shorter narrative. 12 extra `tr`/`td` elements in `before` (the EBITDA + EBITDA Margin row's 5 cells each + their `tr` wrapper, plus one extra header cell) account for the full 76 vs 64 gap.

For the 50 elements that **did** match on identical text, deltas found:

| Element | Before | After | Δ |
|---|---|---|---|
| `th`/`td` "Metric" (1st embedded table) | 203×33 | 182×33 | **width −21px** |
| `th`/`td` "FY2022"/"FY2023"/"FY2024" (1st table) | 99×33 each | 103×33 each | **width +4px each** |
| `th`/`td` "YoY Δ" (1st table) | 196×33 | 204×33 | **width +8px** |
| `th`/`td` "FY2022"/"FY2023"/"FY2024" (2nd embedded table) | 92×33 each | 97×33 each | **width +5px each** |

Same pattern as light theme: width-only redistribution, 4–21px, no height change on matched rows, no overflow flips. The two rowspan-merged narrative-text cells (`PDFacme_saas_cim.pdf3 pg` / the empty investment-insight spacer `td`) show height deltas (383px → 330px) but this is fully explained by the shorter "after" narrative + 2 fewer metric rows, not font metrics — excluded from the font-attributable findings.

### RunTable — light

70/70 total elements matched in count, but this is misleading. Diff shows: doc-name cell "acme_saas_cim.pdf" and 5 adjacent empty-string cells grew 38px → 51px (Δ+13px), and 8 elements are content-unmatched (`before` had a fully empty row; `after` had that row's first 3 data columns populated with real text: `$5.9M[S1]`, `Out of scope` ×2). **Zero deltas on the header row** (`Document`, `Period…`, `Reported EBITDA$…`, etc.) — those matched exactly, 0px change.

Root cause (confirmed via screenshot, not inferred): **every script execution triggers a brand-new workflow run**, and the capture happens while that run is still actively streaming — the "Run History → click first entry" reuse path in `measure-reflow.mjs` (L277–289) never actually reuses a settled run within a single script execution. Evidence: the `before` re-run's light-theme pass captured "Run #6" mid-stream (loading-skeleton bars visible in the screenshot); its dark-theme pass, run moments later in the same script execution, captured a **new** "Run #7," also mid-stream. The `after` run repeated the pattern: "Run #8" (light) and "Run #9" (dark), both freshly created, both mid-stream. This is the exact race the Task 3→4 handoff warned about ("only waits for `<table>` element to exist... does NOT wait for extraction cells to finish streaming"), and it turned out to be worse than anticipated: the brief's hypothesis ("no run history existed yet at Task 2's before-capture time") was not the actual cause — a completed run already existed in history by the time of every subsequent capture, but the script still creates a fresh run every time rather than reusing it. **The prescribed re-run-before mitigation does not fix this**; it produces a differently-incomplete capture, not a settled one.

**Consequence:** RunTable's data-cell content and row heights cannot be compared for font-driven reflow from this data. What *can* be trusted: the header row (10 `th` cells across both tables, 0px delta) and the document-name column widths (0px delta) — those render from static data, not streamed content, and show no reflow.

### RunTable — dark

Same pattern: 70/70 count match, header row 0 deltas, doc-name/empty-cell row heights 38→51px (Δ+13, driven by "after" having captured 2 more populated cells for `acme_saas_cim.pdf` than "before" — a streaming-completeness artifact, not font). 6 elements content-unmatched for the same reason as light theme.

## Methodology problem: DocMatrix answer content is not stable across runs despite storage-state reuse

The plan's Task 2 designed `storage-state.json` reuse specifically so "before" and "after" would show *the same* DocMatrix Q&A content (client-only, localStorage-persisted per `useDocMatrix.ts`), avoiding a different-answer-length confound. In practice this did not hold: `after`'s docmatrix screenshots show visibly different narrative wording and, in the dark-theme case, two fewer extracted metric rows, than `before` — even though the script's `askBox` check correctly detected existing state and skipped re-asking (confirmed: no re-prompt occurred, per the storage-state.json reuse path).

The most likely explanation: navigating to `/app` re-fetches the matrix cell's extraction result from the backend, and that fetch either (a) re-invokes the LLM rather than serving a cached response, or (b) the extraction itself is still asynchronously appending rows/re-generating text server-side between the two script executions (the two `before` captures, run minutes apart, also disagreed with each other in the same way — see the docmatrix-table-light before/after "YoY Growth (%)" vs "ARR ($M)" row swap, which occurred *within a single script execution*, between the light and dark theme passes). This means the storage-state reuse mechanism only guarantees the *question* is preserved, not the *answer* — a gap in the spike's own methodology, worth fixing before this script is reused for anything beyond a one-off spike.

**Practical impact on this spike's conclusions:** low. All content-drift is confined to answer *text* and *row count* on DocMatrix's embedded tables; none of it produced a wrapping/overflow/truncation failure in either before or after, and the cells that share identical text between runs show clean, small, font-attributable width deltas (4–21px) with no height change and no overflow.

## Recommendation for the real ~430-site sweep

**Font-driven reflow risk on these 4 screens is low and, where present, narrow.** Two of four screens (FinancialPanel, TabularEditor) show **zero** measurable reflow. The third (DocMatrixTable) shows small, consistent column-width redistribution (4–21px) on its embedded metric tables — never enough to flip an `overflowing` flag, never a height change, never visible as wrapping or clipping in the screenshots. The fourth (RunTable) could not be measured for its data cells due to a pre-existing script defect, but its static header row and document-name column (the parts unaffected by the streaming race) also show zero reflow.

**Sequence the sweep as: safe to run a straightforward largest-first inline-`fontSize` sweep, with one targeted addition:**

1. **No blocking prerequisite work is needed before starting the sweep.** Nothing in this spike's data justifies delaying the sweep for defensive width-padding, column-min-width changes, or truncation handling — unlike the hypothetical "FinancialPanel needs explicit width padding" scenario the plan flagged as a possible outcome, that did not materialize. FinancialPanel in particular is the *most* data-dense of the four screens and showed the *least* reflow (none).

2. **Budget a small, explicit line item for DocMatrixTable's embedded per-document metric tables** (the `Metric`/`FY2022`/`FY2023`/`FY2024`/`YoY Δ` sub-tables rendered inside each document's answer cell). These are the one place real column-width movement (up to 21px) was observed. It's not breakage, but it's also not zero — when the sweep touches DocMatrix's inline `fontSize` sites, do a quick visual pass on this specific sub-component afterward (narrow scope, not a full re-run of this spike's tooling).

3. **Fix `measure-reflow.mjs`'s RunTable capture before reusing it for the sweep's own verification.** If the sweep plan intends to reuse this script (or one like it) to verify each task's screens, the RunTable step needs one of: (a) wait for the absence of the loading-skeleton class/attribute rather than just `<table>` existing, (b) poll a specific cell's `textContent` for non-empty across all rows before screenshotting, or (c) fix the History-reuse branch so it actually reuses run #N across repeated invocations instead of creating a new run every time (the `firstRun` locator at L280 apparently doesn't match the actual history-list markup — worth checking against `WorkflowCard.tsx`'s real DOM rather than the inferred selector). Until fixed, any RunTable-screen verification in the sweep should be done by eye, not by trusting this script's captured height/width numbers for that screen's data cells.

4. **If the sweep's tooling also reuses `storage-state.json` for DocMatrix**, be aware it does not guarantee identical answer text across runs (see Methodology section) — treat DocMatrix comparisons the same way this spike did: diff by matching identical-text cells, and expect some rows to be non-comparable due to content regeneration, not layout.

## Files referenced

- Script: `frontend/scripts/measure-reflow.mjs`
- Raw data (not committed): `frontend/.reflow-snapshots/before/metrics.json`, `frontend/.reflow-snapshots/after/metrics.json`, and the 16 PNGs
- Font swap commit: `a45cd8c` (Task 3)
- Baseline capture commit: `d92d116` (Task 2)

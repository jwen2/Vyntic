# Plan: FE5 — DealBriefDashboard decomposition

**Status:** FE5.1–FE5.5 done — decomposition complete (2,502 → 374). Only FE5.6 (ddTheme conversion) remains. Branch `feat/fe5-brief-decomposition` (off `main` @ `0cca00f`).

**Depends on:** nothing. This is the last god component; `DocMatrixPanel` (F3.1, 1786→~280) and `TabularRun` (F3.2, 2205→~200) are already decomposed and set the pattern.

**Unblocks:** the Card primitive (62 of ~75 card-shaped borders in the app live in this file — see the DS3 re-scope), a future Input primitive, and deletion of `ddTheme`/`DD_LIGHT`/`DD_DARK` (this is the last real caller; `types.ts` holds only the shim definition).

## Why now

`DealBriefDashboard.tsx` is **2,502 lines** — 2.5× the next-largest component (`AssistantRun`, 983). It was deliberately left alone in F3.3 (Option A kept the panels) and excluded from the DS2 `ddTheme` sweep, on the grounds that restyling it before decomposing would be wasted work. Both deferrals point here.

## Decisions (Stanley, 2026-07-25)

**D1 — characterization tests first.** The ~550 lines of pure parsers (markdown-table parsing, thesis-section extraction, metric inference) have **zero** test coverage today, and they encode real business logic. Tests get written against current behaviour *before* anything moves, so "did the move break the brief?" is a red/green question rather than an eyeball one. They are pure functions, so this is cheap.

**D2 — extract first, restyle second.** Panels move unchanged; the `ddTheme`→Tailwind conversion is a *separate* follow-up pass (§FE5.6), so each diff answers one question. Rejected the one-pass alternative (touch each file once) because "moved correctly" and "restyled correctly" would blur into a single unreviewable diff and defeat bisecting.

## Target structure — `frontend/src/components/dd/brief/`

Mirrors `docmatrix/` and `workflows/tabular-run/`.

**Pure modules (no React, directly testable)**

| File | ~lines | Contents |
|---|---|---|
| `parse.ts` | 400 | `extractMetrics`, `extractFinancialTables`, `isMarkdownTableLine`, `inferTableTitle`, `parseMarkdownTable`, `normalizeTableCell`, `buildChartSeries`, `parseFinancialNumber`, `shortenLabel`, `shortenPeriod`, `inferMetricLabel`, `extractBullets`, `extractBulletsWithSources`, `extractThesisSections`, `extractFirstSourceIdx`, `cleanText`, `pairsToFields`, `deriveActions` |
| `diff.ts` | 120 | `diffPanel`, `normalizeForCompare`, `isNotFound`, `mergeOverrides`, `formatRelativeTime`, `FieldDiff`, `BriefDiffSnapshot` |
| `findings.ts` | 60 | `compareFindingSeverity`, `severityRank`, `isGapFinding`, `isInconsistencyFinding`, `countSources`, `resultByLabel`, `normalizeValue`, `titleCase`, `escapeRegExp` |
| `config.ts` | 170 | `BRIEF_CONFIG`, `SNAPSHOT_FIELDS`, `TRANSACTION_FIELDS`, `FUND_SNAPSHOT_FIELDS`, `FUND_TERMS_FIELDS`, panel labels, `METRIC_KEYWORDS`, `VALUE_PATTERN`, and the shared types (`QuestionResult`, `BriefField`, `Metric`, `ThesisBullet`, `ThesisSections`, `FinancialTable`, `ChartPoint`, `ChartSeries`, `FinancialView`, `BriefEntityConfig`) |

**Hooks**

| File | ~lines | Notes |
|---|---|---|
| `useProactiveScanRun.ts` | 140 | Already a discrete hook (currently lines 149–283) — lifts nearly as-is |
| `useBriefOverrides.ts` | 90 | Override state, server load/PUT, one-time localStorage migration |
| `useBriefDiff.ts` | 110 | Before-snapshot ref, rerun orchestration, diff persistence, dismiss |

**Components**

| File | ~lines | Contents |
|---|---|---|
| `parts.tsx` | 200 | `StatusPill`, `SourcePill`, `CountBadge`, `SeverityDot`, `BulletList`, `Placeholder`, `FreshnessPill`, `DiffPill`, `OverrideBadge`, `SourceChip`, `BriefStatCard` |
| `BriefPanel.tsx` | 180 | `BriefPanel` + `EditableField` |
| `FinancialPanel.tsx` | 290 | `FinancialPanel`, `SegmentedTabs`, `FinancialChart`, `FinancialTableView`, `MetricsTable`, `SimpleFinancialTable` |
| `ThesisPanel.tsx` | 120 | `ThesisPanel`, `ThesisColumn`, `ThesisColumnHeader` |
| `FindingsPanel.tsx` | 145 | |
| `ActionsPanel.tsx` | 85 | |
| `DiffPanel.tsx` | 75 | `DiffPanel` + `DiffRow` |
| `EmptyBrief.tsx` | 45 | |

**Shell:** `DealBriefDashboard.tsx` → **~280 lines**, composition only (F3's DoD was <400).

## Tasks

### FE5.1 — Characterization tests (nothing moves)

- [x] **Step 1:** Temporarily `export` the pure functions from `DealBriefDashboard.tsx` so they can be imported by a test. No behaviour change.
- [x] **Step 2:** Write `briefParsers.test.ts` covering, at minimum: `parseMarkdownTable` (well-formed, ragged rows, missing separator), `extractFinancialTables` (multiple tables, title inference), `buildChartSeries` + `parseFinancialNumber` ($/%/x/m/bn suffixes, negatives, malformed), `extractThesisSections` (all headings, missing headings, unknown headings), `extractMetrics` (keyword hits and misses), `extractBulletsWithSources` + `extractFirstSourceIdx`, `pairsToFields` (preferred-label ordering; the known `[Source N]`-lives-in-`unit` quirk from F3.3), `deriveActions`, `mergeOverrides`, `diffPanel` + `normalizeForCompare` + `isNotFound`.
- [x] **Step 3:** **Pin actual behaviour, including anything that looks wrong.** If a parser has a bug, the test records today's output and gets a `// QUIRK:` comment — this task is a safety net, not a fix. Fixing anything here would make a green suite after the move meaningless. File any real bug as a follow-up note. Commit — `test(frontend): characterize brief parsers before decomposition (FE5.1)`

**FE5.1 done (2026-07-25).** 72 tests in `dd/briefParsers.test.ts`; suite 76 → 148. 31 functions + 9 types temporarily exported from `DealBriefDashboard.tsx` (removed in FE5.2, when only the test's *import line* changes — assertion bodies stay untouched, which is what makes "still green" real evidence).

Four of the initial expectations were wrong and were corrected to match actual behaviour — the point of the exercise. Findings worth acting on later, **deliberately not fixed here**:

1. **Real bug — `parseFinancialNumber` flips the sign of leading-minus values.** `"-5.5"` returns **+5.5**: `negative` is true *and* `parseFloat` already returns `-5.5`, so the `-1` multiplier cancels it. Parenthesised negatives `"(1,234)"` are correct (`-1234`) because the parens are stripped before parsing. Any chart or table fed a `-` negative plots it inverted. Pinned in the suite so the move can't mask it; fix separately, after FE5 lands, with the test updated in the same commit.
2. `parseFinancialNumber` strips every letter `x` (the cleaning class is `/[$€£,%x]/gi`) and `parseFloat` stops at the first non-numeric character, so prose yields numbers: `"6x growth"` → `6`, `"12 employees"` → `12`. Loose, but plausibly intended for multiples.
3. `titleCase` only restores acronyms that are **token-initial**: `"ebitda"` → `EBITDA`, but `"EV/EBITDA"` → `"Ev/ebitda"` (`\w\S*` treats it as one token and lowercases it; the restoration regex `\bEbitda\b` is case-sensitive and no longer matches).

Suffix scaling was initially miscategorised as a quirk and corrected: `m`/`bn`/`k` normalize onto a **millions** base unit consistently.

### FE5.2 — Extract the pure modules

- [x] **Step 1:** Move to `brief/config.ts` first (types + constants; everything else imports from it).
- [x] **Step 2:** Move `brief/parse.ts`, `brief/diff.ts`, `brief/findings.ts`. Re-point the test file's imports at the new paths and **drop the temporary exports** from the shell.
- [x] **Step 3:** Tests must stay green with no edits to their bodies — that is the evidence the move was clean. Commit — `refactor(frontend): extract brief pure modules (FE5.2)`

**FE5.2 done (2026-07-25, `dff7800`).** config.ts 204 / parse.ts 376 / diff.ts 108 / findings.ts 43; shell **2,502 -> 1,868**. All 72 characterization tests pass with assertion bodies byte-identical — only the import block changed. Symbol audit: all **97** top-level symbols present before are present after, none added, none lost. FE5.1's temporary exports are fully retired (the shell has only its default export again).

Blocks were sliced programmatically rather than retyped. Worth knowing if similar tooling is used for FE5.4: the slicer needed three fixes, each surfaced by a guard rather than by inspection — (1) a balanced single-line `interface T { a: string }` has a net depth delta of 0, so it never registered as "opened" and ran into later declarations, producing overlapping ranges that corrupt neighbouring code on delete; (2) a multi-line parameter list ends blocks early because `before: BriefField[],` has balanced `[]` while still inside the `(` — count parens too; (3) `` .replace(/`/g, "") `` puts a backtick inside a regex literal, which a naive scanner reads as opening a template string. A disjointness assertion plus a "every block must end with `}` or `;`" truncation guard caught all three.

### FE5.3 — Extract the hooks **and test them**

**Scope changed (Stanley, 2026-07-25) after challenging the task's value.** Two of the three stated justifications did not survive: *reuse* is zero (nothing else will ever consume these hooks) and *line count* is circular. The estimate was corrected too — the shell lands ~330–450, not the ~280 first claimed.

The one justification that holds is testability. `useBriefOverrides` and `useBriefDiff` carry the server I/O this plan's Risks section flagged as uncovered, and inside a 2,500-line component that logic was untestable. So FE5.3 was upgraded from "move the hooks" (which captures only the weak benefits) to "move **and** test them", converting a one-time browser check at FE5.5 into permanent CI coverage.

- [x] **Step 1:** `useProactiveScanRun.ts` (self-contained already) — verbatim lift with its cell mappers, no tests (SSE + multi-effect; still verified in-app at FE5.5).
- [x] **Step 2:** `useBriefOverrides.ts` — owns `overrides` state, the server load, the localStorage→server migration, and `setOverride`. **12 tests.**
- [x] **Step 3:** `useBriefDiff.ts` — owns `diff`/`diffOpen`/`rerunning`, `beforeSnapshotRef`, `persistDiff`, `handleRerun`, `dismissDiff`. **11 tests.**
- [x] Commit — `refactor(frontend): extract brief hooks with tests (FE5.3)`

**FE5.3 done (2026-07-25, `1b3c23f`).** Shell **1,868 → 1,593**; hooks 222 / 82 / 159. Suite **148 → 171**.

Covered: server-first load; the one-time migration (PUT *then* clear, so it cannot run twice) and the local copy being retained when that PUT fails; fallback to local when the server errors; unparseable local JSON; reload on deal change; `setOverride` add/trim/clear-empties-the-panel/sibling-preservation and a swallowed PUT failure still landing the edit. For the diff: snapshot load/parse-failure/dismiss/deal-change, the two re-run guards, and a full lifecycle asserting the diff is computed against the *pre-run* snapshot, carries `previousAt` forward, opens the panel only when something changed, and persists.

**One behaviour-preserving fix, caught by tsc:** `setDiffOpen` is typed `Dispatch<SetStateAction<boolean>>`, not the narrower `(open: boolean) => void` first written — the call site toggles via the functional-updater form, which the narrow type would have silently removed.

### FE5.4 — Extract the components, leaf-first

- [x] **Step 1:** `parts.tsx` first — every panel uses these, and the DS2 prop-cascade lesson applies.
- [x] **Step 2:** The panels: `EmptyBrief`, `DiffPanel`, `ActionsPanel`, `ThesisPanel`, `FindingsPanel`, `BriefPanel`, `FinancialPanel`.
- [x] Panels keep their `theme` prop for now — conversion is FE5.6.

**FE5.4 done (2026-07-25, `123f6be`).** Shell **1,593 → 374**, under the <400 target. parts.tsx 228 / FinancialPanel 272 / BriefPanel 195 / BriefHeader 168 / FindingsPanel 152 / ThesisPanel 130 / ActionsPanel 93 / DiffPanel 81 / EmptyBrief 50.

**Deviation: `BriefHeader.tsx` was not in the plan.** The header card (title, status pills, actions, stat row) is presentation like every other panel, so leaving it inline once the rest had moved would have been inconsistent — and it takes the shell under 400, which the planned modules alone did not (they left it at 469). Cost: an 18-prop interface, the honest price of a header displaying 18 pieces of derived state.

Module imports are computed by scanning each block for known symbols rather than hand-listed. Two generator gaps surfaced as tsc errors and were fixed at source: `Button` is a *default* export, and the parse symbol table was incomplete. Separately, 39 orphaned imports were left in the shell — **lint caught those, not tsc**, since `noUnusedLocals` is not set; worth remembering for FE5.6.

Side effect: `DealBriefDashboard.tsx` no longer calls `ddTheme` at all. The remaining callers are the nine new `brief/` components — FE5.6's scope, now spread across small files.

### FE5.5 — Shell reduction + verification

- [x] **Step 1:** Shell holds only props, the three hooks' wiring, the `onFindingsExtracted` effect, derived counts, and JSX composition — **374 lines** (the ~280 estimate was optimistic; see FE5.3's note).
- [x] **Step 2:** Verified in-app, headless Edge, light + dark.
- [x] **Step 3:** gates green.

**FE5.5 done (2026-07-25).**

**A live run was not possible and was not needed.** `GEMINI_API_KEY` is required (`backend/app/agents/llm.py:40`) and there is no `.env` in the repo nor the key in the environment, so kicking off a real Proactive Scan would have failed. Rather than ask for a secret, the run payload was **mocked via Playwright route interception** — the same technique DS2 used for `/runs/**` and `/query/stream`. For a pure frontend refactor against an unchanged backend contract this is the stronger test anyway: deterministic, free, mutates no data, and it drives states a single real run would not produce (the plan itself records that real runs sometimes yield empty KV cells).

The **real** workflow endpoint was left un-mocked, so the synthetic run's cells key off the live `Proactive Scan` column ids (11 columns).

Two datasets, each in both themes, **20/20 probes passing and zero page errors**:
1. *Populated* — header/status/freshness/source pills, all 5 stat cards (Coverage 11/11), both KV panels with citation chips (p.12 / p.23), a `Not found` value rendering correctly, financial panel with trend chart + Revenue Bridge table + Metrics tab.
2. *Sparse* — the empty-state paths ("Awaiting scan output", "No financial metrics extracted yet") alongside a populated thesis panel (all four columns), the findings panel, next actions, and finding counts flowing into the stat cards.

The `Quarterly` tab correctly renders **disabled** when the run carries no quarterly table.

**Not covered:** the inline override edit and the diff pill/panel after a re-run were exercised by the FE5.3 hook tests rather than in-app; `useProactiveScanRun`'s SSE path is still unverified by either route — its subscription was stubbed with an empty event stream.

### FE5.6 — ddTheme conversion (separate pass, after FE5.5 lands)

- [ ] Per-file `ddTheme`→Tailwind token conversion across `brief/`, using the DS2 techniques (leaf-first; `var(...)` substitution where a token is mixed into a dynamic ternary; **never** a bare `border` shorthand where the original carried `${c.field}` — it resets `border-color` to `currentColor`).
- [ ] Then delete `ddTheme`, `DD_LIGHT`, `DD_DARK` from `dd/types.ts` and the explanatory comments in `index.css`. Grep guard: `grep -rn "ddTheme(\|DD_DARK\|DD_LIGHT" frontend/src` returns nothing.

## Risks

- **Not covered by tests:** `useProactiveScanRun` and `useBriefOverrides` do real server I/O (`putBriefOverrides`, findings sync). Characterization tests cover parsers only. These are verified in-app at FE5.5, the same way F3.4 was — do not claim test coverage for them.
- **Findings re-emit effect** (`onFindingsExtracted`) has a deliberately trimmed dependency array with an eslint-disable. Preserve it verbatim when moving; "fixing" it risks an infinite re-emit loop.
- **`ddTheme` prop threading:** every panel currently takes `theme`. Extract with the prop intact; removing it is FE5.6's job.

## Verify (every task)
- `cd frontend && npx tsc --noEmit && npx vitest run && npm run build` green; `npx eslint src` no new errors (baseline: 0 errors, ~52 warnings).
- FE5.5 additionally: headless-Edge screenshots, light + dark, against a live completed run.

## Definition of done
- `DealBriefDashboard.tsx` under 400 lines; no other file in `brief/` over ~300.
- Parser characterization tests green, with bodies unchanged from FE5.1 through FE5.5.
- No behaviour or visual change through FE5.5 (styling changes belong to FE5.6).
- One commit per task/file-group per the steps above.

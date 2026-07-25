# Plan: Design-system primitives — Modal, ddTheme retirement, Card

**Status:** DS1 done. **DS2 done, including Step 3** — 18 real file-groups converted here (`5fd8255` latest); the shim itself was deleted by FE5.6 (`a07f629`) once the brief was decomposed, so `frontend/src` now has zero `ddTheme`/`DD_LIGHT`/`DD_DARK`. **DS3 done, brief-scoped** — DS3a `SectionLabel` dedup + DS3b `--focus` token landed on `feat/design-system-ds3`; the Card primitive (this plan's Step 2/3, tracked in detail in `docs/todo/2026-07-25-card-primitive.md`) shipped on `feat/design-system-card`, migrating all 18 card-shaped containers the ~62-call-site blocker had locked inside `DealBriefDashboard` before FE5's decomposition made them individually addressable. App-wide Card rollout and the Input primitive remain deferred pending a look decision (see DS-Card task 4 notes below).

## DS2 completion (2026-07-24)

All 18 real file-groups converted and verified in headless Edge, light + dark, against live data wherever reachable (2 groups — `DocumentDetailView.tsx`'s dead code and `TabularEditor`/`AssistantEditor`'s create-mode paths — verified via tsc/lint/build only, documented per-group above). Every commit is listed in the git log (`deeae24` pilot through `5fd8255` final); see each numbered "Group N" note above for what was found, converted, and how it was verified.

**Net result:** `ddTheme()` — a shim that already just returned `var()` refs — is now called from exactly one file. The plan's original goal (a colorway edit is one line in `index.css`) was actually achieved back in F3.5; what this sweep achieved on top of that was **deleting the redundant second styling path** in ~750 of ~775 call sites, cutting several hundred net lines, and along the way fixing real defects the ddTheme layer had been masking: two missing focus traps (DS1), a scrim-click guard bypass (DS1), and two instances of a border-shorthand bug that would have silently discarded a border-color class (DS2 groups 12 & 13) — plus clearing both of the two pre-existing lint errors recorded in project memory, as an incidental byproduct of removing the dead variables ddTheme conversion touched.

**What's left, deliberately:**
- `DealBriefDashboard.tsx` (2,502 lines, 23 refs) stays out of scope — slated for decomposition under FE5; converting its styling now would be wasted work plus merge pain against that future rewrite.
- The `ddTheme`/`DD_LIGHT`/`DD_DARK` shim in `types.ts` (and its explanatory comments in `index.css`) stays until `DealBriefDashboard` is either converted or FE5 lands and removes it outright.
- `SectionLabel` was found duplicated **six times** across the codebase (all six now converted individually, not consolidated) and the Card/bordered-panel shape recurs ~13+ times — both flagged as DS3 candidates, not done here.

## DS2 audit + pilot (2026-07-24)

**The plan's Step-1 premise was wrong: the sweep is not mechanical.**

*Scale.* "102 call sites" counted `ddTheme(` invocations (105 — roughly one per component). The real edit surface is **775 `c.<field>` references**.

*Shape.* Of 258 inline style objects carrying a token, **only 64 are color-only** — the ones where the planned `style={{background: c.surface}}` → `className="bg-surface"` swap actually applies. The rest mix color with `fontSize`/`padding`/`letterSpacing`, so converting them means rewriting the whole object into utilities. Plus **145** refs inside template literals (`` `1px solid ${c.border}` ``), **79** inside ternaries, and **9** imperative `e.currentTarget.style.X = c.field` hover writes that have no className path at all without moving to CSS `:hover`. That is the "684 inline→class churn" F3.5 deferred.

*Value.* `ddTheme()` already returns `var()` refs, so **the colorway is already a single edit in `index.css`** — F3.5's collapse of `DD_LIGHT`/`DD_DARK` achieved this plan's stated goal. DS2 buys deletion of a redundant second path, not theming capability. Weigh the remaining ~690 hand edits against that.

*DS3-first was considered and rejected:* only ~13 sites are the bordered/rounded/padded Card shape, so a Card primitive would not absorb a meaningful share of the sweep.

**Field → class table** (Step 1's deliverable). 12 of 16 map cleanly; 4 have no alias and would need adding to `tailwind.config.js` before any file that uses them is converted:

| field | class | | field | class |
|---|---|---|---|---|
| `bg` | `bg-appbg` | | `zebra` | `bg-zebra` |
| `surface` | `bg-surface` | | `gridHeader` | `bg-grid-header` |
| `surfaceAlt` | `bg-surface-alt` | | `accent` | `accent` |
| `border` | `border-edge` | | `accentStrong` | **missing** |
| `borderLight` | `border-edge-light` | | `accentTint` | **missing** |
| `t1`–`t4` | `text-t1`–`text-t4` | | `accentTintBorder` | **missing** |
| | | | `onAccent` | **missing** |

**Pilot — `workflows/tabular-run/` (`deeae24`): done.** 82 refs across 8 files, 191 lines net removed, zero `ddTheme` left in the directory. Verified in headless Edge light + dark against a completed tabular run; every token flips correctly. tsc clean, lint unchanged (2 pre-existing errors), 76 tests, build green.

Techniques that generalise to the remaining files:
- **`styles.ts` CSSProperties factories → exported class strings.** Base constants must omit `position` (and padding/background where a consumer overrides them): competing utilities in one class string resolve by **stylesheet order, not string order**, and this project has no `tailwind-merge`. Compose non-overlapping sets instead of relying on override order.
- **Side-specific border colors** (`border-b-edge-light` + `border-r-edge` on one cell) are required wherever the original set two different border colors — a blanket `border-edge` flattens it. Confirmed generated in the built CSS.
- **Status hues stay inline.** AMBER/GREEN/RED and `tint(ACCENT, n)` color-mix washes have no token; move only the neutral fallback to a class and let `undefined` fall through to it. Where a lookup map is mostly hues (`RunStatusPill`), keep the whole map inline referencing `var(--text-2)` directly rather than splitting one component across two styling paths.
- **Prop cascade is the real win.** Six components dropped their `theme` prop entirely once their last `ddTheme` reference went. Components forwarding `theme` to not-yet-converted children must keep it, so convert leaf-first where possible.

**Not verified live:** `ColumnEditMenu` renders only for non-builtin workflows and the one cloned tabular workflow has no runs, so reaching it would need a fresh extraction (an LLM API call). Its classes are the same ones proven elsewhere in the directory; `bg-appbg` was confirmed in the built CSS only.

**Also found:** `SectionLabel` is hand-duplicated in **six** files (`tabular-run/parts.tsx`, `MonitoringPanel`, `AssistantEditor`, `AssistantRun`, `MemoOutput`, `TabularEditor`) — a stronger primitive candidate than Card. Worth folding into DS3.

**Group 2 — `workflows/cells/` (`2e3c746`): done.** `CellRenderer.tsx` (10 refs) and `ShapeControls.tsx` (16 refs) — the leaf both `RunCell` and `ColumnEditMenu` were still forwarding `theme` into for the same reason DS1 forwarded props to unconverted children. Converting it let six call sites across four files (`ColumnEditMenu`, `RunCell`/`ValueCell`, `RunTable` incl. `RunRow`'s memo comparator, `TabularEditor`, `CompareView`) drop `theme` entirely, confirming the pilot's "prop cascade" prediction generalizes.

One new technique: a Tailwind color-only utility (`border-edge`) sets `border-color` but not `border-style`/`width` — pairing it with the bare `border` utility is required or no edge renders at all. Confirmed by reading the generated CSS rule, not assumed.

Verified in headless Edge, light + dark, against "QofE Bridge" (metric cells) and "Contract Stack Review" (bool/list/enum/text — the shape variety `tabular-run/` didn't exercise), plus "Contract Stack Review (Copy)"'s editor for `ShapePicker`/`ShapeOptionsInspector`/`CellRenderPreview`. Bool-badge hue and the pre-existing `--text-4` "Out of scope" styling came back pixel-identical to their prior inline-style values. tsc clean, lint unchanged, 76 tests, build green.

**Group 3 — dd/workflows dialogs (`b8d6b9a`): done.** `PositionModal`, `DocumentsModal`, `DocumentSelectorModal` — the three remaining dialogs already on `<Modal>` from DS1 whose internal styling still ran through `ddTheme`. Added the 4 missing Tailwind aliases from the field→class table above (`accent-strong`, `accent-tint`, `accent-tint-border`, `on-accent`) to `tailwind.config.js`, since `PositionModal`'s computed-metrics tint box needed three of them and none had a class before.

`DocumentsModal` keeps its `theme` prop — `categoryChipStyle`'s `FAMILY_STYLES` are hardcoded per-family hex pairs, not tokens, so `isDark` still branches on it. Where a token was mixed into a dynamic ternary (the scope-toggle button, the chip's neutral fallback), the `c.field` reference was substituted with a literal `var(--css-var)` string rather than forced into a class — identical output, since `ddTheme()` already returns the same `var()` ref; this avoids fighting the "class vs. class" stylesheet-order ambiguity for values that only ever appear inside inline-style ternaries. `PositionModal` and `DocumentSelectorModal` drop `theme` entirely; their callers (`DealWorkspacePage.tsx`, `WorkflowsView.tsx`) updated.

**Gotcha:** a leftover vite dev server from an earlier turn predated the `tailwind.config.js` edit and kept serving the old Tailwind color palette — new classes existed in the DOM but resolved to no rule, so the first verification pass silently returned the wrong (default black) colors. Restarting the dev server fixed it. Any config-file change (not just component edits) invalidates an already-running dev server for verification purposes.

Verified in headless Edge, light + dark: `DocumentsModal` via a live deal's document row list, scope toggle, and category/period fields; `DocumentSelectorModal` via a workflow's "Run extraction" flow; `PositionModal` against `hillpath_fund_iv` (the only fund-entity deal in the dev DB) with commitment/called/distributed/NAV filled in client-side only, never saved, to render the accent-tint computed-metrics box. All values matched their tokens exactly in both themes. tsc clean, lint unchanged, 76 tests, build green.

**Group 4 — `TopBar.tsx` + `LeftSidebar.tsx` (`3ab3015`): done.** The deal-workspace chrome. Both keep `theme` — chip/badge colors (TopBar) and skeleton loaders / history-row hover (LeftSidebar) branch on `isDark` for hardcoded hex unrelated to `ddTheme` — but every `c.field` converts to a class, or (LeftSidebar's active nav item, where border/background/text all vary together per row) a conditional className string composing non-overlapping fragments, same pattern as the pilot's `RunCell`.

Verified in headless Edge, light + dark, against both a plain deal (no Position button) and a fund entity (has one), to exercise every branch: surface/border chrome, active-nav highlight, deal-id chip, and the Position button — the latter two reusing the accent-strong/tint/tint-border aliases added last group. All matched exactly. tsc clean, lint unchanged, 76 tests, build green.

**Process note:** a `TaskStop` call on a background vite process did not actually kill it (Windows); it kept listening on 5311 across turns. Confirming with `netstat`/`taskkill` before relying on "stopped" being true would have caught this sooner — verification against a supposedly-dead dev server risks silently testing stale code.

**Group 5 — `WorkflowCard.tsx` + `WorkflowLibrary.tsx` (`667a757`): done.** Both keep `theme` at the top level (`isDark` box-shadow branching), but every internal helper that only used it to reach `ddTheme` drops it: `Section`, `EmptyState`, `NewMenuButton` all lose the prop, call sites updated. `WorkflowBadge`'s color/background/border args and `NewMenuButton`'s imperative hover handler get `var(...)` substitution rather than class conversion or restructuring — consistent with the "don't fight dynamic per-instance styling into classes" rule established in group 3.

Verified in headless Edge, light + dark, against the live Workflows tab: page background, header card, search field, the workflow-count stat row (`text-accent`), a card's surface/border, its "Built-in" badge, and the "New workflow" dropdown menu — all matched tokens exactly.

**Repeat process note:** two more background dev-server processes from this session survived their `TaskStop` calls; both had to be found via `netstat` and `taskkill`'d directly. Treat `TaskStop` as "requested," not "confirmed," for any server used in the next verification pass.

**Group 6 — `MemoOutput.tsx` (`fce8321`): done.** The memo/extraction output screen — a clean leaf (only `DocumentViewer`/`AnswerText`, neither theme-aware), so `theme` drops entirely from the component and both its helpers (`MemoSection`, `SectionLabel`); it existed solely to reach `ddTheme`. `WorkflowsView.tsx`'s call site updated.

This file's `SectionLabel` is another instance of the six-times-duplicated component the pilot flagged — converted in place to match the already-converted `tabular-run/parts.tsx` version, without consolidating the duplication (still DS3 scope).

Verified in headless Edge, light + dark, against a completed assistant run ("CIM → IC Memo Draft" run #1 — the workflow's other two runs are checkpoint-status and don't reach this screen). Crumb, h1, TOC sidebar chrome, TOC links, and the Sources section label all matched their tokens exactly. tsc clean, lint unchanged, 76 tests, build green.

Both this session's background dev servers again outlived their `TaskStop` calls; caught and force-killed via `netstat`/`taskkill` before verifying, same as the last two groups.

**Group 7 — `CompareView.tsx` (`92fda39`): done.** The tabular-run "Compare" tab (anchor doc + diff-highlighting). No `isDark` or other theme usage anywhere in the file, so `theme` drops entirely from every function — `CompareView`, `CompareCard`, `ProseBody`, `CitationStrip`, `PlaceholderBody`, and `toneStyles`' `c` parameter. `TabularRun.tsx`'s call site updated; `TabularRun` keeps its own `theme` since it still calls `ddTheme` directly for its own (not-yet-converted) styling.

`toneStyles()` is the clearest example yet of the "return plain strings, don't force a class split" pattern: two of its four tones (`anchor`/`diff`) are `tint()`-derived hues with no token, so the two neutral tones (`missing`/`agree`) keep returning `var(...)` literals from the same function rather than becoming classes at their call site — splitting one function's output across two styling mechanisms would be worse than the ddTheme call it replaces.

Verified in headless Edge, light + dark, against a completed "Contract Stack Review" run's Compare view: all four tone badges (Anchor/Consistent ×3/Diverges), the anchor card's border and citation strip, and the highlight-differences toggle's active state all matched tokens exactly. tsc clean, lint unchanged, 76 tests, build green.

**Group 8 — `TabularRun.tsx` (`31be933`): done.** The last `ddTheme` holdout in the tabular-run cluster started by the pilot — only 5 refs (the error-state screen and main container's bg/text), all static. `theme` drops entirely; `WorkflowsView.tsx`'s call site updated (it keeps its own `theme`, 19 refs remaining). This retires `ddTheme` from every file under `components/workflows/tabular-run/` and `components/workflows/cells/` — both directories the pilot and group 2 targeted are now fully clean.

The main container's tokens were already exercised in every prior tabular-run screenshot this session, so verification targeted the one genuinely new path: `m.error && !m.run`, reached by routing `GET /runs/**` to a 500 via Playwright request interception (browser-side only — no backend or data touched). "Couldn't load run" heading, error detail text, and background all matched tokens in both themes. tsc clean, lint unchanged, 76 tests, build green.

**Group 9 — `TabularEditor.tsx` (`f013d8b`): done.** The tabular workflow create/edit screen. No `isDark` usage anywhere, so `theme` drops entirely — `TabularEditorProps` and every helper (`SectionLabel`, `Field`, `ColumnCard`, `SmallIconButton`, `GridPreview`, `cellStyle`). `WorkflowsView.tsx`'s two call sites (create and edit mode) updated.

`inputStyle(c)` (a `CSSProperties` factory feeding 4 inputs/textareas) becomes a single `inputClass` string — same pattern as the pilot's `styles.ts`. `ColumnCard`'s active-state border (`VIOLET`, not a token) and `cellStyle()` (consumed via the `style` prop, not `className`, so it stays a plain-object factory) got `var(...)` substitution rather than a class split.

Fourth converted instance of the six-times-duplicated `SectionLabel` — left duplicated, still DS3 scope.

Verified in headless Edge, light + dark, against "Contract Stack Review (Copy)"'s editor: active row-source toggle, the active column card's violet border, `ShapePicker`'s active tile, the label input, the dashed "Add column" button, the grid preview table, and the derived-columns empty state all matched tokens exactly. tsc clean, lint unchanged, 76 tests, build green.

**Group 10 — `AssistantEditor.tsx` (`35cda88`): done.** The assistant workflow create/edit screen (stage rail + prompt editor + flow preview) — same shape as `TabularEditor`: no `isDark` usage, so `theme` drops entirely from every function. `WorkflowsView.tsx`'s two call sites updated. `StageRailItem`'s active state and `FlowStep`'s active/checkpoint state get `var(...)` substitution (three properties change together per state, mixing ACCENT/AMBER with token fallbacks) — same treatment as `ColumnCard` and `toneStyles()`.

Fifth converted instance of the duplicated `SectionLabel`.

Verified in headless Edge, light + dark, against "CIM → IC Memo Draft (Copy)"'s editor: active stage rail item, amber checkpoint badges/flow steps, active blue flow step, prompt textarea, toggle switch, and active "Word" output button all matched tokens exactly. tsc clean, lint unchanged, 76 tests, build green.

**Group 11 — `AssistantRun.tsx` (`e7a64af`): done.** The largest single file converted this sweep — the assistant workflow run/checkpoint screen (stage rail, checkpoint approval, sources sidebar, run history). Same shape as the other two editor/run screens: no `isDark`, so `theme` drops entirely from all six helpers. `WorkflowsView.tsx`'s call site updated. Sixth and final converted instance of the duplicated `SectionLabel`.

This closes out every file under `components/workflows/` except `WorkflowsView.tsx` itself (the hub all three editor/run screens render into).

Verified in headless Edge, light + dark, against "CIM → IC Memo Draft"'s checkpoint-status run: the checkpoint banner, paused stage rail item, amber "Awaiting review" label, sources-cited sidebar with citation cards, and Cancel button all matched tokens exactly. tsc clean, lint unchanged, 76 tests, build green.

**Process note:** a leftover backend process from an earlier turn survived a `taskkill` that reported success — `tasklist` could no longer find the PID, yet `:8000` kept responding. Not blocking, left running rather than blind-kill further PIDs; worth a manual check if a stray `uvicorn` is still around at session end.

**Group 12 — `WorkflowsView.tsx` (`2e752b1`): done.** The workflow-screen router/hub — its own loading/error states plus the local `RunHistoryModal` helper convert; the top-level `theme` prop stays (still forwarded to `WorkflowLibrary`, unconverted for `isDark`). `RunHistoryModal` drops `theme` entirely; its call site updated.

**Caught a real bug before it shipped:** converting `border: \`3px solid ${c.border}\`` to a bare `border: "3px solid"` string plus a `border-edge` class looked equivalent but isn't — the `border` shorthand resets every unspecified sub-property to its initial value, and `border-color`'s initial value is `currentColor`, not "whatever a class set". That would have silently discarded the class and painted the spinner ring in the current text color. Fixed by splitting into `borderWidth`/`borderStyle` longhands, which don't touch `border-color`, letting the class's `border-color: var(--border)` apply as intended. Audited every other border-shorthand conversion this sweep for the same mistake; found none — this is the only place a bare multi-value shorthand replaced one that used to carry a `${c.field}`.

This retires `ddTheme` from every file under `components/workflows/` — no exceptions left in that directory.

Verified in headless Edge, light + dark, against the Run History drawer: panel chrome, title, subtitle, close button, and both completed-run entries matched tokens exactly. tsc clean, lint unchanged, 76 tests, build green.

**Group 13 — `DealAssistantPanel.tsx` (`36a795d`): done.** The main Agent chat panel. Different shape from every prior group: it calls `useTheme()` itself rather than receiving `theme` as a prop, so only its two internal helpers (`InitialAssistantState`, `ChatBubble`) needed the prop dropped, no external caller to touch.

Second instance of the border-shorthand color-reset bug from group 12, caught the same way: the "reading" spinner needed `borderWidth`/`borderStyle` instead of a bare `border` shorthand.

Verified in headless Edge, light + dark: the "Begin your diligence" empty state, the sources picker dropdown, and a full chat exchange. The assistant's answer was mocked via Playwright route interception on `/query/stream` (no real LLM call) — but `saveConversation` isn't mocked and fired for real against the dev backend both times, leaving two harmless conversation records in Recent for `acme_saas`.

**Group 14 — `MonitoringPanel.tsx` (`25bb537`): done.** The fund-only capital-calls/side-letters screen. Structurally different from every prior file: `c` (the `ddTheme()` result) was threaded as an explicit prop through ~9 shared components (`Card`, `SectionLabel`, `Empty`, `Banner`, `Field`, `InputMini`, `SelectMini`, `StatusPill`, `SubTab`) instead of each calling `ddTheme()` itself — so converting touched nearly every line, not just the two section components that used `c` directly.

`SubTab`'s active/inactive state is a fully classed conditional (`bg-accent text-on-accent border-accent` vs `bg-surface-alt text-t2 border-edge`) rather than staying inline — accent/on-accent are already Tailwind-aliased tokens, no `tint()`-derived hue involved, unlike every other active-state pattern this sweep.

Removing `MiniBtn`'s dead, unused `c?:` type parameter as part of the conversion incidentally cleared a pre-existing lint error (`MonitoringPanel.tsx:371` unused `c`) that predated this branch.

Verified in headless Edge, light + dark, against Hillpath Fund IV's Monitoring screen: both tabs, active/inactive `SubTab` styling, card chrome, and dashed empty-state borders all matched tokens exactly. No capital-call/side-letter data exists in the dev DB to exercise populated rows, but every empty-state and chrome path is covered.

**Group 15 — `DocumentDetailView.tsx` (`1e13ddf`): done.** Confirmed dead code — re-checked before starting, unimported anywhere. Converted anyway for consistency with the rest of `components/dd/`; deleting the unreferenced file is a separate call outside this sweep. `theme` stays (isDark still drives an unrelated severity-label lookup); every `c.field` becomes a class or a `var(...)` substitution where mixed into hover handlers / conditional ternaries (the back-button hover, `FindingCard`'s deal-breaker styling, the ask-agent button, suggested-prompt hover). No visual verification possible for dead code — tsc/lint/build only, all green (lint 0 problems).

## Progress (2026-07-24)

**DS1 — Modal primitive: done.** `components/ui/Modal.tsx` + `modal.css` (10 tests), five dialogs migrated, 123 net lines removed. tsc / lint (no new errors) / 76 tests / build all green.

Found during the migration, beyond the planned markup de-duplication:
- **Real a11y gaps, now closed.** The audit assumed `useDialogA11y` was applied uniformly. It wasn't: `PositionModal` had `role`/`aria-modal` but **no focus trap**, and `AddDealDialog` had **no `role`, no `aria-modal`, and no trap at all**. Both get the shared behaviour by construction now.
- **`DocumentsModal`'s guarded Escape** (dismiss an inner confirm before closing the modal) was a window-level listener that only covered the keyboard — a scrim click bypassed it. It now routes through the `onClose` handed to `<Modal>`, so every close path honours the guard.
- **`ConfirmDialog` gained a `confirmVariant` prop** instead of a hardcoded red confirm: 7 of its 8 call sites guard a delete/discard, but `WorkflowsView`'s "Open existing copy" is a plain either/or that would have been mis-signalled as destructive.
- **Token convergence:** four different scrims and four z-indexes (50/90/1000/9999) collapsed into `--modal-scrim` / `--modal-shadow` / `--z-modal`; five panel widths onto three size steps.

**`DocumentViewer` — deliberately not migrated.** It is a *drawer*, not a dialog: full-height right-side slide-in (`w-[94vw]`, `max-w-[1400px]`, `animate-slide-in-right`) with body-scroll-lock and a global Escape handler it needs because the embedded cross-origin iframe swallows keydowns. `<Modal>`'s centered, `max-height: 88vh`, `max-width: 45rem` panel is the wrong shape. If a second drawer ever appears, a sibling `Drawer` primitive should share the scrim + `useDialogA11y` with `Modal` — one component serving both would need to fork on nearly every style.

Grep guard passes: remaining `fixed inset-0` hits are `DocumentViewer` (above) and the mobile nav sidebars in `DealWorkspacePage`/`HomePage` (`lg:hidden` sidebar rail + scrim — navigation, not dialogs).

**Verified in-app** (`frontend:verify`, headless Edge, light + dark) — all five dialogs driven for real, each screenshotted and DOM-probed:

| Dialog | size | probe |
|---|---|---|
| AddDealDialog | md | on `.modal-panel`, `aria-modal`, named, portaled to `<body>` |
| DocumentsModal | lg | header actions (upload) render; inline confirm still guards close |
| PositionModal | lg | eyebrow/title/description header correct |
| DocumentSelectorModal | md | gains a close × it never had |
| ConfirmDialog | sm | `btn--danger` → `#c2410c` light / `#e8836a` dark; `btn--primary` on the benign clone path |

Tokens flip correctly with the theme: panel `#fff` → `#171717`, scrim `rgba(15,23,42,.55)` → `rgba(0,0,0,.62)`, `z-index` 1000 everywhere.

**One pre-existing bug found, deliberately not fixed** (out of scope; belongs to the landing-system conversion): in dark mode `AddDealDialog`'s footer "Cancel" is `LandingButton variant="ghost"`, which computes `color: rgb(17,17,17)` — near-black text on a dark panel, effectively invisible. Verified byte-identical on `main` (`git checkout main` + same probe), so DS1 neither caused nor worsened it. The "Create deal" button is likewise a white landing pill rather than the app's accent. Both disappear when that form moves off the landing inputs.

Pre-existing lint errors left untouched (present on the branch point, unrelated to this work): `MonitoringPanel.tsx:371` unused `c`, `ManagerPage.tsx:121` unused `isDark`.

---

**Depends on:** UI1/UI2 (`components/ui/Button.tsx` + `button.css` establish the pattern to follow — no `theme` prop, pure CSS-var classes); F3.5 (semantic tokens in `index.css`, Tailwind color aliases in `tailwind.config.js`, the `ddTheme()` shim it left in place).

**Goal:** Stop hand-rolling markup/colors per file. Extend the one real shared component that exists today (`Button`) with a small set of app-wide primitives, so a future colorway change is a token edit, not a grep-and-replace across 30 files.

## Context (audited 2026-07-24 @ `dd53958`)

Contrary to `docs/todo/README.md`'s prior "not started" line, **F3 is done** — `frontend-f3-decomposition` and `frontend-f3-theming` both merged (PR #101). `DocMatrixPanel` (259 lines) and `TabularRun` (214 lines) are decomposed; brief KV/list cells render typed data directly; findings/overrides persist server-side; semantic CSS vars exist in `index.css` (`--surface`, `--text-1/2/3`, `--border`, `--accent`, `--danger`, `--status-*`, `--violet`) and are aliased in Tailwind (`bg-surface`, `text-t1`, `border-edge`, `bg-zebra`, ...). `DealBriefDashboard` (2,502 lines) decomposition remains separately deferred (FE5) — not this plan's concern.

What F3.5 did *not* finish: `ddTheme(theme)` in `components/dd/types.ts` is a deprecated shim, kept alive specifically so its **102 call sites across ~30 files** need no change — it now returns the same `var(--surface)` etc. refs as the Tailwind aliases, just via inline `style={{ background: c.surface }}` instead of a class. That's a second, redundant styling path layered on top of working tokens.

Separately, `components/ui/` has exactly one primitive (`Button`/`button.css`). Everything else is bespoke: 6 modal-ish components (`ConfirmDialog`, `dd/DocumentsModal`, `dd/PositionModal`, `workflows/DocumentSelectorModal`, `AddDealDialog`, `DocumentViewer`) each hand-roll their own overlay (`fixed inset-0 z-50 flex items-center justify-center bg-black/35`) and panel chrome — though the actual a11y logic (focus trap, Escape, initial focus, focus restore) is *already* de-duplicated in the shared `hooks/useDialogA11y.ts` hook (FE13). `ConfirmDialog` additionally borrows the **landing page's** separate mini design system (`components/landing/ui/LandingPanel` etc.) with manual `isDark ? "inverse" : "default"` patches, instead of the app's own surface/text tokens — a second design system bleeding across a boundary it wasn't built for.

**Decision (Stanley, 2026-07-24):** Modal is hand-rolled (`components/ui/Modal.tsx` + `modal.css`), reusing `useDialogA11y` unchanged — not a Radix adoption. No new frontend dependency; matches `Button`'s existing pattern. API is flat props + free `children` (no `Modal.Header`/`Body`/`Footer` subcomponents) — the 6 current modals vary too much in body shape to force a shared internal layout.

*Refined during DS1 Step 1:* the header is `eyebrow` / `title` / `description` / `headerActions`, not `title` alone. Reading all five headers first showed they share exactly one shape — eyebrow?, title, description? on the left; extra actions? + close on the right — with 2 of 5 using the eyebrow and 4 of 5 the description. These stay flat optional props (the "minimal set the real call sites need"), so the no-subcomponents decision is unchanged.

## Task DS1 — Modal primitive

**Files:** create `frontend/src/components/ui/Modal.tsx`, `frontend/src/components/ui/modal.css`; modify `ConfirmDialog.tsx`, `dd/DocumentsModal.tsx`, `dd/PositionModal.tsx`, `workflows/DocumentSelectorModal.tsx`, `AddDealDialog.tsx` (evaluate `DocumentViewer.tsx` — may be a poor fit, a full-screen surface rather than a dialog; defer if so, same as UI1 deferred poor-fit buttons).

- [x] **Step 1:** Build `Modal`: props `{ title?: string; onClose: () => void; size?: "sm" | "md" | "lg"; labelledBy?: string; children: ReactNode }`. Renders via `createPortal(..., document.body)` (matches the portal pattern `ColumnConfigPopover`/`AddQuestionBar`/`DocMatrixTable` already use for floating UI). Overlay + panel use `bg-surface` / `border-edge` tokens, not `ddTheme`. Attaches `useDialogA11y(onClose)`'s ref, `role="dialog"`, `aria-modal="true"`, `aria-label`/`aria-labelledby`. Optional header row: `title` text + a `Button variant="subtle" iconOnly` close ×.
- [x] **Step 2:** Migrate `ConfirmDialog` first (simplest body) — also drop its `LandingPanel`/`isDark` patch entirely, moving onto `Modal` + the app's own tokens. Parity: title/message render, Cancel/Confirm work, Escape/Tab-trap/focus-restore unchanged (regression against `useDialogA11y`, not new a11y work).
- [x] **Step 3:** Migrate the remaining modals one at a time (`DocumentsModal`, `PositionModal`, `DocumentSelectorModal`, `AddDealDialog`), each its own commit. For each: confirm `useDialogA11y` wiring moves cleanly onto `Modal`'s ref, verify no visual regression in light+dark via `frontend:verify` screenshots.
- [x] **Step 4:** Evaluate `DocumentViewer` — migrate if it fits the dialog shape, otherwise document why it's deferred (mirrors UI1's deferred-buttons note). Grep guard: `grep -rE "fixed inset-0.*z-50" frontend/src` should only match inside `Modal.tsx` (plus `DocumentViewer` if intentionally deferred). Commit — `feat(frontend): shared Modal primitive; migrate dialog components`

## Task DS2 — ddTheme → Tailwind sweep

**Files:** the ~30 files listed by `grep -rln "ddTheme(" frontend/src`; finally `components/dd/types.ts`.

- [x] **Step 1:** ~~Confirm the mapping is mechanical~~ — **done, and it isn't.** See the audit above for the field→class table (4 fields still need aliases in `tailwind.config.js`) and the measured breakdown of why ~75% of sites need whole-object rewrites.
- [x] **Step 1b (pilot):** Convert `workflows/tabular-run/` to measure real cost per file before committing to the rest. Done in `deeae24` — 8 files, 82 refs, verified light + dark.
- [ ] **Step 2 — DECISION POINT (Stanley):** with the pilot's real numbers in hand, choose whether to continue the sweep, and how far. If continuing, convert per directory, leaf-first (not largest-first — a component forwarding `theme` to unconverted children can't drop the prop). **`DealBriefDashboard.tsx` (23 calls, 2,502 lines) should be excluded**: it is slated for decomposition under FE5, so restyling it now is wasted work plus merge pain.
- [x] **Step 3 — done by FE5.6 (`a07f629`), not here.** `ddTheme`, `DD_LIGHT`, `DD_DARK` are gone from `types.ts`; the grep guard returns nothing. As predicted, this was unreachable until `DealBriefDashboard` was decomposed: FE5.4 spread its 23 calls across nine small `brief/` components, and FE5.6 converted those 92 refs and pulled the shim. See `2026-07-25-fe5-brief-decomposition.md` §FE5.6.

## Task DS3 — Card/Panel primitive

**Files:** create `frontend/src/components/ui/Card.tsx`, `frontend/src/components/ui/card.css`; migrate call sites surfaced once DS2's sweep clears the noise (expect: brief panels, workflow cards, manager/position page sections).

- [x] **Step 1: done** — superseded by the brief-scoped re-scope decision (`docs/superpowers/specs/2026-07-25-card-primitive-design.md`): the 18 real call sites are all in `components/dd/brief/`, enumerated directly from that directory rather than a codebase-wide grep, once FE5's decomposition made them individually addressable.
- [x] **Step 2: done** — see `docs/todo/2026-07-25-card-primitive.md` (DS-Card) for the full task-by-task record. `components/ui/Card.tsx` + `card.css` ships three `level`s (`hero`/`panel`/`inner`, each fixing radius + default padding), three `tone`s (`surface`/`alt`/`alert`, background + border colour), a `dashed` modifier, and a `padding` escape hatch for the three table wrappers (`0`) and `BriefStatCard` (`"12px 14px"`) — same no-`theme`-prop / CSS-var contract as `Button`/`Modal`, 11 unit tests. A new `--card-hero-shadow` token (light: two-layer soft shadow; dark: one deeper layer) replaces `BriefHeader`'s `isDark` ternary. All 18 hand-rolled card containers in `components/dd/brief/` migrated (`grep -rn 'className="border border-edge bg-surface' src/components/dd/brief/` returns nothing) — 8 hero/panel containers, 10 inner containers. Six sites carry an intentional, spec-agreed visual delta: `BriefStatCard` radius 20→18, `EditableField` radius 16→18 + padding 10→12, `DiffRow` padding 10→12, `EmptyBrief` padding 24→20 and gains the hero shadow, `BriefHeader`'s shadow moves from an inline ternary to the token (same resolved value, confirmed by string-equality assertion in both themes). The other 14 sites were proven byte-identical via an in-browser computed-style A/B diff (sibling injection of the pre-migration inline style next to the live `<Card>`, `getComputedStyle` on nine box-model properties) — 30/30 checks (14 sites × 2 themes, with `BriefPanel`'s two live instances and all three financial table-wrapper variants each independently checked) passed in both light and dark, zero mismatches. The six changed sites were also screenshotted before/after in both themes and visually confirmed correct (subtle 2–4px deltas, no clipping/misalignment; `EmptyBrief`'s gained shadow visible against an old-style comparison clone). **App-wide Card (beyond `brief/`) and the Input primitive remain deferred** — the app's other bordered-panel surfaces use a tighter radius geometry (6–16px vs. `brief/`'s 18–28px), so extending Card there is a look decision, not a mechanical migration; DS3's original a11y/token candidates for Input (`SectionLabel` dedup, `--focus` token) already landed separately as DS3a/DS3b.
- [x] **Step 3: done**, folded into Step 2's verification (see above) rather than a separate pass — the plan's original two-step split (parity, then screenshots) collapsed once the computed-style diff technique (proven in DS3b) covered parity and screenshots covered only the six intended deltas.

## Out of scope (future plans, not this one)

- Badge/Pill, Input/Select, Table-row primitives — no inventory taken yet; premature to design now.
- `DealBriefDashboard` god-component decomposition (FE5) — separately deferred, unrelated to styling.
- `components/landing/ui/` itself — the landing page's own mini design system stays as-is; only `ConfirmDialog`'s cross-boundary borrowing of it is in scope (DS1 Step 2).

## Verify (every task)
- `cd frontend && npx tsc --noEmit && npm run build && npx vitest run` green.
- `frontend:verify` headless-Edge screenshots (light + dark) of every migrated surface.
- DS1 additionally: manual a11y regression per modal (focus-in on open, Tab wraps, Escape closes, focus restored on close).

## Definition of done
- Zero `ddTheme(`, `DD_LIGHT`, `DD_DARK` in `frontend/src` (DS2).
- All 6 modal-ish components on `<Modal>`, or a documented poor-fit deferral (DS1).
- No stray `fixed inset-0 z-50` dialog markup outside `Modal.tsx` / documented deferrals.
- One commit per task/file-group per the steps above.

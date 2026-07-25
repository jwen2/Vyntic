# Plan: Design-system primitives — Modal, ddTheme retirement, Card

**Status:** DS1 done on `feat/design-system-primitives`; DS2 in progress (3 of ~23 file-groups converted: `tabular-run/`, `cells/`, dd/workflows dialogs — `ddTheme` still referenced in 20 files); DS3 not started.

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
- [ ] **Step 3:** Only once *every* call site is converted, delete `ddTheme`, `DD_LIGHT`, `DD_DARK` from `types.ts`. Grep guard: `grep -rn "ddTheme(\|DD_DARK\|DD_LIGHT" frontend/src` returns nothing. Commit per directory group. Note this step is unreachable while `DealBriefDashboard` is excluded — either it gets converted too, or the shim survives until FE5 lands.

## Task DS3 — Card/Panel primitive

**Files:** create `frontend/src/components/ui/Card.tsx`, `frontend/src/components/ui/card.css`; migrate call sites surfaced once DS2's sweep clears the noise (expect: brief panels, workflow cards, manager/position page sections).

- [ ] **Step 1:** After DS2 lands, grep for the recurring "bordered rounded padded div" pattern (`border-edge`, `rounded-*`, `bg-surface` co-occurring) to find real call sites rather than guessing up front.
- [ ] **Step 2:** Build `Card` with the minimal prop set the actual call sites need (likely just `padding`/`className` — resist adding variants speculatively). Migrate in one or two tranches by directory.
- [ ] **Step 3:** Parity pass + `frontend:verify` screenshots. Commit — `feat(frontend): Card primitive; migrate bordered-panel call sites`

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

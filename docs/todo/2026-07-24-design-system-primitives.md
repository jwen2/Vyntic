# Plan: Design-system primitives — Modal, ddTheme retirement, Card

**Status:** not started.
**Depends on:** UI1/UI2 (`components/ui/Button.tsx` + `button.css` establish the pattern to follow — no `theme` prop, pure CSS-var classes); F3.5 (semantic tokens in `index.css`, Tailwind color aliases in `tailwind.config.js`, the `ddTheme()` shim it left in place).

**Goal:** Stop hand-rolling markup/colors per file. Extend the one real shared component that exists today (`Button`) with a small set of app-wide primitives, so a future colorway change is a token edit, not a grep-and-replace across 30 files.

## Context (audited 2026-07-24 @ `dd53958`)

Contrary to `docs/todo/README.md`'s prior "not started" line, **F3 is done** — `frontend-f3-decomposition` and `frontend-f3-theming` both merged (PR #101). `DocMatrixPanel` (259 lines) and `TabularRun` (214 lines) are decomposed; brief KV/list cells render typed data directly; findings/overrides persist server-side; semantic CSS vars exist in `index.css` (`--surface`, `--text-1/2/3`, `--border`, `--accent`, `--danger`, `--status-*`, `--violet`) and are aliased in Tailwind (`bg-surface`, `text-t1`, `border-edge`, `bg-zebra`, ...). `DealBriefDashboard` (2,502 lines) decomposition remains separately deferred (FE5) — not this plan's concern.

What F3.5 did *not* finish: `ddTheme(theme)` in `components/dd/types.ts` is a deprecated shim, kept alive specifically so its **102 call sites across ~30 files** need no change — it now returns the same `var(--surface)` etc. refs as the Tailwind aliases, just via inline `style={{ background: c.surface }}` instead of a class. That's a second, redundant styling path layered on top of working tokens.

Separately, `components/ui/` has exactly one primitive (`Button`/`button.css`). Everything else is bespoke: 6 modal-ish components (`ConfirmDialog`, `dd/DocumentsModal`, `dd/PositionModal`, `workflows/DocumentSelectorModal`, `AddDealDialog`, `DocumentViewer`) each hand-roll their own overlay (`fixed inset-0 z-50 flex items-center justify-center bg-black/35`) and panel chrome — though the actual a11y logic (focus trap, Escape, initial focus, focus restore) is *already* de-duplicated in the shared `hooks/useDialogA11y.ts` hook (FE13). `ConfirmDialog` additionally borrows the **landing page's** separate mini design system (`components/landing/ui/LandingPanel` etc.) with manual `isDark ? "inverse" : "default"` patches, instead of the app's own surface/text tokens — a second design system bleeding across a boundary it wasn't built for.

**Decision (Stanley, 2026-07-24):** Modal is hand-rolled (`components/ui/Modal.tsx` + `modal.css`), reusing `useDialogA11y` unchanged — not a Radix adoption. No new frontend dependency; matches `Button`'s existing pattern. API is a single `title` prop + free `children` (no `Modal.Header`/`Body`/`Footer` subcomponents) — the 6 current modals vary too much in body shape to force a shared internal layout; `title` is the one genuinely common structural piece.

## Task DS1 — Modal primitive

**Files:** create `frontend/src/components/ui/Modal.tsx`, `frontend/src/components/ui/modal.css`; modify `ConfirmDialog.tsx`, `dd/DocumentsModal.tsx`, `dd/PositionModal.tsx`, `workflows/DocumentSelectorModal.tsx`, `AddDealDialog.tsx` (evaluate `DocumentViewer.tsx` — may be a poor fit, a full-screen surface rather than a dialog; defer if so, same as UI1 deferred poor-fit buttons).

- [ ] **Step 1:** Build `Modal`: props `{ title?: string; onClose: () => void; size?: "sm" | "md" | "lg"; labelledBy?: string; children: ReactNode }`. Renders via `createPortal(..., document.body)` (matches the portal pattern `ColumnConfigPopover`/`AddQuestionBar`/`DocMatrixTable` already use for floating UI). Overlay + panel use `bg-surface` / `border-edge` tokens, not `ddTheme`. Attaches `useDialogA11y(onClose)`'s ref, `role="dialog"`, `aria-modal="true"`, `aria-label`/`aria-labelledby`. Optional header row: `title` text + a `Button variant="subtle" iconOnly` close ×.
- [ ] **Step 2:** Migrate `ConfirmDialog` first (simplest body) — also drop its `LandingPanel`/`isDark` patch entirely, moving onto `Modal` + the app's own tokens. Parity: title/message render, Cancel/Confirm work, Escape/Tab-trap/focus-restore unchanged (regression against `useDialogA11y`, not new a11y work).
- [ ] **Step 3:** Migrate the remaining modals one at a time (`DocumentsModal`, `PositionModal`, `DocumentSelectorModal`, `AddDealDialog`), each its own commit. For each: confirm `useDialogA11y` wiring moves cleanly onto `Modal`'s ref, verify no visual regression in light+dark via `frontend:verify` screenshots.
- [ ] **Step 4:** Evaluate `DocumentViewer` — migrate if it fits the dialog shape, otherwise document why it's deferred (mirrors UI1's deferred-buttons note). Grep guard: `grep -rE "fixed inset-0.*z-50" frontend/src` should only match inside `Modal.tsx` (plus `DocumentViewer` if intentionally deferred). Commit — `feat(frontend): shared Modal primitive; migrate dialog components`

## Task DS2 — ddTheme → Tailwind sweep

**Files:** the ~30 files listed by `grep -rln "ddTheme(" frontend/src`; finally `components/dd/types.ts`.

- [ ] **Step 1:** Confirm the mapping is mechanical: every `ddTheme(theme)` field (`c.surface`, `c.text1`, `c.border`, ...) has a 1:1 Tailwind class already aliased in `tailwind.config.js` (`bg-surface`, `text-t1`, `border-edge`, etc. — extend the alias list in `tailwind.config.js` first if any field is missing one). Write the field→class table in the PR description, same discipline as F3.3's cell-shape inventory.
- [ ] **Step 2:** Convert file by file, largest call-site count first (`DealBriefDashboard.tsx` has the most). Replace `const c = ddTheme(theme); style={{ background: c.surface }}` with `className="bg-surface"` (merge into existing className strings, don't stack a second `style` prop). Components that only used `theme` for this can drop the `theme` prop/`useTheme()` call entirely once their last `ddTheme` reference is gone — but only if nothing else in the file needs `theme`.
- [ ] **Step 3:** Once all call sites are converted, delete `ddTheme`, `DD_LIGHT`, `DD_DARK` from `types.ts` (they exist solely for this shim). Grep guard: `grep -rn "ddTheme(\|DD_DARK\|DD_LIGHT" frontend/src` returns nothing. Commit per file-group (e.g. per directory: `dd/`, `workflows/`, `pages/`) rather than one giant commit — `refactor(frontend): ddTheme(theme) call sites → Tailwind token classes` per group, final `refactor(frontend): delete ddTheme/DD_LIGHT/DD_DARK shim`.

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

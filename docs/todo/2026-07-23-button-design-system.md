# Plan: Shared `Button` design-system component

**Status:** not started — 3 decisions in header
**Scope:** build a standardized `<Button>` component (5 variants, 3 sizes, disabled/loading/icon-only states, hover "flare" motion) from the finalized Claude Design artifact, then migrate a first tranche of the ~169 raw `<button>` call sites onto it.
**Branch (when started):** `feat/button-design-system`
**Depends on:** PR #111 (workflows UI/UX pass) merged to `main` first — this branch starts fresh off updated `main`.

## Context

The app currently has **169 raw `<button>` elements across 47 files**, each hand-styled inline via `ddTheme(theme)` objects (`components/dd/`, `components/workflows/`, `components/assistant/`) or Tailwind classes (`components/docmatrix/`). There is no shared button primitive — no `components/ui/`, `common/`, or `primitives/` directory exists yet. This produces real drift: **10 files still hardcode a pill radius** (`borderRadius: 999` or `99`) even after the workflows/`/app` de-rounding passes in PR #110/#111, because each button is a one-off.

A full design was mocked in Claude Design/Artifacts (published at `https://claude.ai/code/artifact/d28fab59-3f84-4d31-ad8e-c833f92bbbec`, source `button-system.html`) and iterated once on user feedback that the flat version looked "basic or robotic," adding a hover/press "flare": gradient fill + directional icon nudge on `primary`, a charge-up fill transition on `tint`, a soft double-ring focus state, and a `prefers-reduced-motion` fallback that disables all transform-based motion. That artifact is the spec this plan implements — no further design iteration is in scope here, only the build.

**Critical constraint carried over from the artifact:** `Button` takes **no `theme` prop**. All colors resolve from CSS custom properties (`--accent`, `--surface-alt`, `--border`, etc.), the same tokens `index.css` already flips via the `.dark` class on `<html>`. This is what lets one component work uniformly across both the `ddTheme()` inline-style tree and the Tailwind-class tree without threading theme state through it.

## Decisions required (resolve before Task 1)

- **D1 — migration scope for this PR.**
  - *Land component + first tranche only (recommended):* ship `Button` + tests, migrate 3 areas (workflows library/cards, agent hero/composer, `/app` shell — the same set discussed with the user as "Option B"). Leave the remaining ~140 call sites as a tracked v2 follow-up rather than one sprawling PR touching 47 files.
  - *Migrate everything in one pass:* higher short-term consistency, but a much larger, harder-to-review diff and higher regression risk across surfaces (docmatrix, monitoring, brief) that haven't been visually audited this session.
  - **Recommendation: first tranche only.**
- **D2 — CSS placement.**
  - *Dedicated `components/ui/button.css`, imported once (recommended):* keeps `index.css` focused on tokens; the button ruleset is sizeable (5 variants × states + motion + reduced-motion block) and is naturally scoped to one component.
  - *Append classes directly into `index.css`:* fewer files, but mixes token definitions with component-level rules in the file every other component already depends on.
  - **Recommendation: dedicated `button.css`.**
- **D3 — `danger` variant color tokens don't exist yet.**
  - `index.css` currently defines `--accent`/`--accent-tint`/`--accent-tint-border` and `--violet-tint-border` (light + dark blocks) but **no `--danger` equivalents** — existing red usage (`RED = "#ef4444"` in `components/workflows/theme.ts`, status pills, the Cancel button in `RunToolbar.tsx`) is a flat hex constant, not a themed CSS var.
  - *Add `--danger` / `--danger-tint` / `--danger-tint-border` to both light/dark blocks in `index.css`, value-matched to the existing `#ef4444` (recommended):* keeps the new danger buttons visually consistent with every existing red badge/pill instead of introducing a second red.
  - **Recommendation: add the vars, matched to `#ef4444`.**

## Invariants to honor

- **No `theme` prop on `Button`** — colors resolve purely from CSS custom properties so it drops into both styling trees unchanged.
- **No resting accent/danger glow** — box-shadow "lift" only applies on `:hover`/`:active`, never at rest (explicit user feedback earlier this session: a resting colored shadow "hurts my eyes").
- Respect `prefers-reduced-motion: reduce` — the artifact's motion block (translateY lift, press-compression, icon nudge) must fully disable under it, keeping only color transitions.
- Icon-only buttons require an accessible name (`title` or `aria-label`) — enforce with a dev-only console warning, not a runtime throw.
- Don't touch `docmatrix/` (Tailwind tree) or any surface outside the D1 first tranche in this PR — that's explicitly deferred, not silent scope creep.

---

## Tasks (test-first)

### Task 1 — Danger CSS tokens (per D3)
- Add `--danger`, `--danger-tint`, `--danger-tint-border` to both the light and dark blocks in `frontend/src/index.css`, value-matched to `RED = "#ef4444"` in `components/workflows/theme.ts` (same tint percentages already used by `tint(RED, 10/26)` elsewhere, so danger buttons match existing red chips/pills exactly).

### Task 2 — `components/ui/button.css`
- Implement `.btn` base + `.btn--primary/tint/secondary/subtle/danger` + `.btn--sm/md/lg` + disabled/loading/icon-only states + focus ring + hover/press motion, transcribed from the finalized artifact (`button-system.html`, section "00 — the flare" is the reference for the motion values: shared `cubic-bezier(.2,.7,.3,1)` easing, `translateY(1px) scale(.985)` on `:active`, `.arrow` nudge on hover, double-ring focus `box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent-tint-border)`).
- Full `@media (prefers-reduced-motion: reduce)` block disabling transform-based rules, keeping color transitions.
- Import once (e.g. from `main.tsx` or `App.tsx`), per D2.

### Task 3 — `components/ui/Button.tsx`
- **Test first** (`components/ui/Button.test.tsx`, Vitest + RTL, following `ErrorBoundary.test.tsx`'s pattern):
  - renders each `variant`/`size` with the expected class names.
  - `loading` disables the button, keeps the label text in the DOM (no width jump), hides `iconLeft`/`iconRight` in favor of a spinner.
  - `disabled` and `loading` both suppress `onClick`.
  - `iconOnly` without `title`/`aria-label` triggers a dev-only `console.warn`; with one, no warning and the name is exposed via `getByRole("button", { name: ... })`.
  - forwards arbitrary native `<button>` props (e.g. `type="submit"`, `data-testid`).
- **Impl:** props `variant` (`primary | tint | secondary | subtle | danger`), `size` (`sm | md | lg`, default `md`), `iconLeft?`, `iconRight?`, `iconOnly?: boolean`, `loading?: boolean`, `fullWidth?: boolean`, plus `...rest: ComponentPropsWithoutRef<"button">`. No `theme` prop (invariant above).

### Task 4 — Migrate tranche 1: Workflows
- `WorkflowLibrary.tsx`: "New workflow" button → `primary`; search-clear → `subtle` icon-only.
- `WorkflowCard.tsx`: Run → `tint` (matches its current accent-tint-at-rest/solid-on-hover treatment, which was hand-built ahead of this system — replace the manual `onMouseEnter`/`onMouseLeave` handlers with the CSS-driven hover from Task 2); Clone/History → `secondary`; Delete → `danger`.
- `RunToolbar.tsx`: `← Library` → `subtle`; Cancel → `danger`; Excel export → `primary`.
- `RunCell.tsx`: retry icon button → `secondary` `iconOnly`.

### Task 5 — Migrate tranche 2: Agent (deal-workspace)
- `DealAssistantPanel.tsx`: composer Ask button → `primary` (preserve the existing cobalt-tint disabled treatment — confirm it matches `Button`'s built-in disabled style before removing the bespoke one); Sources trigger → `secondary`.
- `LeftSidebar.tsx`: "+ New chat" → `tint`.

### Task 6 — Migrate tranche 3: `/app` shell
- `HomeTopBar.tsx`: account dropdown trigger → `secondary`.
- `DealListItem.tsx`: Analyze → `primary`; Upload → `secondary`.

### Task 7 — Verify + cleanup
- `cd frontend && npx tsc --noEmit && npm run build` green; `npx vitest run` green.
- `frontend:verify` headless-Edge screenshots (light + dark) of each migrated surface: workflows library, a tabular run toolbar, the agent composer, `/app` deal card.
- Re-run the `borderRadius: (999|99)` grep — confirm the migrated files no longer appear; document the remaining count (files outside this tranche) as the v2 starting point.

## Out of scope (v2 follow-up)
- Remaining ~140 raw `<button>` call sites outside the three tranches above (monitoring, brief, docmatrix, manager/position panels, modals).
- Any new visual variant not in the artifact (this plan implements the finalized design only).
- Migrating `docmatrix/`'s Tailwind buttons to `Button` (would need a Tailwind-class-compatible entry point or acceptance that `Button` renders its own classes inside a Tailwind tree — worth a quick spike first, not assumed here).

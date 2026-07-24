# Plan: Button design-system — v2 rollout

**Status:** not started
**Depends on:** UI1 (`2026-07-23-button-design-system.md`) first tranche merged — the `Button` primitive, `button.css`, and the `--danger*` tokens must exist.
**Branch (when started):** `feat/button-system-v2`

## Context

UI1 shipped the shared `<Button>` (5 variants, 3 sizes, states, hover flare) and migrated the first tranche (workflows library/cards + tabular-run toolbar, agent composer + `New chat`, `/app` account trigger). This plan finishes the rollout and pays down two commitments made during UI1.

## 1. Unify the app on one red (the D3 commitment)

UI1 set `--danger` to the artifact's burnt-orange (`#c2410c` light / `#e8836a` dark) rather than the app's existing `RED = #ef4444`. That was accepted **on the condition** that the existing red surfaces migrate onto the `--danger` token, so the app converges on a single red instead of showing burnt-orange danger buttons beside bright-red status pills.

Migrate these off `#ef4444` and onto `var(--danger)` / `var(--danger-tint)` / `var(--danger-tint-border)`:
- `components/workflows/theme.ts` — `RED` constant (and its `tint(RED, …)` call sites): the tabular `RunStatusPill` **error** state, and any other status pill using `RED`.
- Status/severity pills and badges elsewhere that hardcode `#ef4444` / `#dc2626` / `#f87171` (e.g. `home/DealListItem.tsx` upload-error text/bar, other run-status surfaces).
- Audit with: `grep -rE "#ef4444|#dc2626|#f87171" frontend/src`.

Acceptance: no bright-`#ef4444` red renders next to a `--danger` button; one red across the app in both themes.

## 2. Deferred poor-fit buttons from UI1's tranche 1

These were intentionally **not** migrated in UI1 because the current system doesn't fit them cleanly — resolve each here:

- **`tabular-run/RunCell.tsx` retry button** — an 18×18 cell-corner icon control. The smallest icon button today is `sm` = 30×30, which blows out the cell corner. Options: add an `xs` icon size (~20px) to `button.css` + `Button`, or leave it bespoke. Decide before migrating.
- **`home/DealListItem.tsx` "Analyze" chip** — a 10px uppercase chip that turns accent **only when its row is selected**. Making it always `primary` would put a loud primary on every list row (violates "primary = one per view"). Needs either a selected-state pattern or a `tint`/`secondary` treatment — not a straight `primary`. Also note: the plan's "Upload → secondary" has no target here (uploads render as a progress bar, not a button).
- **`home/HomeTopBar.tsx` "Add deal" + "Portfolio"** — "Add deal" is a clean `primary` candidate and "Portfolio" a `secondary`/mono-chip, but both carry `hidden sm:block` responsive classes. Because `button.css` loads after Tailwind utilities, `.btn { display: inline-flex }` overrides `.hidden`; migrate by wrapping each `<Button>` in a `<div className="hidden sm:block">` (don't put the responsive class on the button). "Portfolio" also needs its mono-uppercase character preserved via `style`/`className`.

## 3. Remaining raw `<button>` call sites (~140)

Migrate the rest, surface by surface, onto `<Button>`:
- **docmatrix/** (Tailwind tree) — needs the spike noted in UI1's out-of-scope: confirm `Button`'s own class output composes acceptably inside the Tailwind-class tree, or add a compatible entry point.
- **monitoring/**, **dd/** brief + document views, **manager/position panels**, **modals** (`DocumentsModal`, `DocumentSelectorModal`, etc.).
- Re-run `grep -rEc "borderRadius: (999|99)[,}]" frontend/src` (26 literals across 10 files at UI1 close) and drive the button-shaped ones to zero; the rest are non-button pills/badges out of scope for this component.

## Verify
- `cd frontend && npx tsc --noEmit && npm run build` green; `npx vitest run` green.
- `frontend:verify` headless-Edge screenshots (light + dark) of each migrated surface.

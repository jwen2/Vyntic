# Cobalt Accent System — Design

**Date:** 2026-07-09
**Status:** Approved (user-validated via brainstorming + visual candidates in the "Vyntic Design System" claude.ai/design project)
**Supersedes:** the 2026-07-09 "keep monochrome, fix structure" decision from the PM contrast discussion — the user explicitly chose to add a signature accent.
**Builds on:** branch `frontend-guardrails` (F1 + F2 done). Precedes Plan F3; pulls F3.5's `--accent` token idea forward for color only.

## Goal

Add contrast and color pop to the whole product (landing + app) with **one signature accent — cobalt** — on the existing warm-gray monochrome base. Color is spent only where it carries meaning (actions, selection, navigation, focus, links, live indicators), never as decoration and never as judgment.

## Decision trail

- Scope: whole product (landing + home + deal workspace + workflows).
- Energy: one signature accent, not multi-hue, not tinted surfaces.
- Hue: three candidates (cobalt / emerald / rust) rendered as design-system cards; user chose **cobalt**. Deciding argument: in a diligence tool, color already encodes judgment (severity red/amber, workflow success green) — blue is the only strong hue that stays semantically neutral ("interactive/selected", never "the deal is fine"). Secondary: warm-paper + blue-ink editorial pairing; dark-mode emerald drifts minty.

## Token layer (single source of truth)

`frontend/src/index.css` `:root` gains (names final):

```css
--accent: #1d4ed8;            /* fills w/ white text 6.7:1; on bg #f3f3ee 6.0:1 */
--accent-strong: #1e40af;     /* text/links on white 8.7:1; on tint 7.4:1 */
--accent-tint: #e7edfb;       /* selection wash */
--accent-tint-border: #b6c6ee;
```

`html.dark` scope (ThemeContext already toggles the `dark` class on `<html>`, so `var()` flips automatically):

```css
--accent: #8ab4ff;            /* on surface #171717 8.6:1; dark text on it 9.2:1 */
--accent-strong: #8ab4ff;
--accent-tint: rgba(138,180,255,0.12);
--accent-tint-border: rgba(138,180,255,0.35);
```

All ratios measured (WCAG 2.x), not estimated. Consumers:

- `DD_LIGHT` / `DD_DARK` in `frontend/src/components/dd/types.ts` gain `accent / accentStrong / accentTint / accentTintBorder` keys whose values are the `var()` strings (same pattern DD_LIGHT already uses for `--landing-*`).
- `ACCENT = "#111111"` in `dd/types.ts` and `workflows/theme.ts` re-point to `var(--accent)`. Audit each usage during implementation: usages that meant "ink" (e.g., the black Closed/Committed badge) stay literal ink; usages that meant "emphasis/interactive" become accent.
- No component hardcodes a cobalt hex anywhere.

## Application rules

Accent appears in exactly these roles, both themes:

1. **Primary action buttons** — one per view region (Run analysis, Upload, New deal, Save). Light: `--accent` fill, white text. Dark: `--accent` fill, near-black (`#0f0f0f`) text.
2. **Active navigation** — active tab / nav item: `--accent-strong` text + 2px accent indicator (underline or left bar, matching each nav's existing geometry).
3. **Selection** — selected deal row, list item, matrix cell focus: `--accent-tint` wash + 3px accent inset bar + `--accent-tint-border`.
4. **Links & citation references** — `--accent-strong`.
5. **Focus** — global `:focus-visible` outline switches from `currentColor` to `var(--accent)`.
6. **Live/progress indicators** — streaming pulse, progress bars, spinners (including the off-palette `ProtectedRoute` spinner — fixes part of FE13 early).
7. **Key data highlight** — at most one accent-colored stat per dashboard view.

**DocMatrixPanel's ~27 blue occurrences** are mapped onto these tokens (mostly roles 3/4/6) — the deferred "blue remnants" cleanup resolves by absorption, not deletion.

## Explicit non-goals (stays exactly as is)

- Severity trio (red/amber/gray) and stage badges, incl. black Closed/Committed.
- Workflow status GREEN `#22c55e` / AMBER / RED; `VIOLET #5f5f57` type tag.
- Body text, borders, surfaces, secondary/ghost buttons — monochrome.
- No tinted section headers, no accent-washed panels, no hero recolor beyond the CTA.
- Landing page keeps its editorial monochrome (grid, noise, reveals untouched); only hero CTA + section links go cobalt.

## Files touched (implementation inventory)

- `frontend/src/index.css` — token definitions + `:focus-visible`.
- `frontend/src/components/dd/types.ts`, `frontend/src/components/workflows/theme.ts` — token keys + ACCENT re-point.
- Targeted edits in the ~30 files consuming `ACCENT`/blue hexes (grep inventory from 2026-07-09: DocMatrixPanel 27, TabularRun 13, DealBriefDashboard 10, AssistantRun 10, CompareView 9, …). God components get **value swaps only** — no structural edits, so F3.1–F3.3 decomposition is unaffected.
- `frontend/tailwind.config.js` only if a Tailwind `accent` color simplifies landing edits; otherwise deferred to F3.5.

## Sequencing

Lands on branch `cobalt-accent` (from `frontend-guardrails`), after F2, **before** F3 decomposition. F3.5's mechanical inline-style → class conversion later reads the same vars; nothing here is redone.

## Verification

- `npm run lint && npm run build && npm test` green.
- Visual pass in both themes: landing, home, deal workspace tabs, workflows, modals — check every accent role above plus severity-chip adjacency (no red/blue vibration).
- Update the "Vyntic Design System" claude.ai/design baseline card (`foundations/palette.html`) with the accent scale after implementation.

# Design: Card primitive (brief-scoped)

**Date:** 2026-07-25
**Status:** approved (Stanley, 2026-07-25)
**Depends on:** FE5.6 (`feat/fe5.6-brief-theming`) — the brief's card containers must already carry `border border-edge bg-surface{,-alt}` rather than `ddTheme` inline styles.
**Plan:** DS3 Step 2 in `docs/todo/2026-07-24-design-system-primitives.md`, re-scoped.

## Why now, and why only the brief

DS3 deferred Card on evidence from its own Step-1 grep: `DealBriefDashboard` held 62 of ~75 card-shaped borders, and there was no consistent radius to standardize onto (17 distinct `rounded-*`).

FE5.4 decomposed that file and FE5.6 converted its styling, which makes a system visible that was always there:

| Level | Radius | Sites |
|---|---|---|
| hero | 28 | `BriefHeader`, `EmptyBrief` |
| panel | 24 | `BriefPanel`, `ActionsPanel`, `DiffPanel`, `ThesisPanel`, `FindingsPanel`, `FinancialPanel` |
| inner | 18 | `ThesisColumn` (×2 paths), `DiffRow`, finding card, chart card, 3 table wrappers |
| outlier | 20 | `BriefStatCard` |
| outlier | 16 | `EditableField` |

15 of 18 card-shaped containers already land on three steps and carry an identical `border border-edge bg-surface{,-alt}` class string.

**The rest of the app is a different geometry** and stays out of scope: `rounded-lg` (8px, 26 uses), `rounded-md` (6px, 20), `rounded-2xl` (16px, 11), `rounded-xl` (12px, 10). Workflows/docmatrix are tight-radius; the brief is soft-radius. Unifying them is a visual redesign, not a refactor — a separate decision, deliberately not taken here.

## API

`frontend/src/components/ui/Card.tsx` + `card.css`, following `Button` and `Modal` exactly: `forwardRef`, no `theme` prop, every colour from a CSS custom property, geometry in the sibling stylesheet (18/24/28 are not Tailwind steps, so they belong in CSS rather than arbitrary-value classes).

```tsx
export type CardLevel = "hero" | "panel" | "inner";
export type CardTone  = "surface" | "alt" | "alert";

interface CardOwnProps {
  level: CardLevel;            // radius + default padding
  tone?: CardTone;             // default "surface"
  dashed?: boolean;            // EmptyBrief only
  padding?: number | string;   // escape hatch; tables pass 0
}

export type CardProps = CardOwnProps &
  Omit<ComponentPropsWithoutRef<"div">, keyof CardOwnProps>;
```

| level | radius | default padding | hero shadow |
|---|---|---|---|
| `hero` | 28 | 20 | `var(--card-hero-shadow)` |
| `panel` | 24 | 16 | — |
| `inner` | 18 | 12 | — |

| tone | background | border colour |
|---|---|---|
| `surface` | `--surface` | `--border` |
| `alt` | `--surface-alt` | `--border` |
| `alert` | `--status-critical-tint` | `--status-critical-tint-border` |

**Rules.** Radius always comes from `level` — there is no `radius` prop, because after the snaps below every site lands on a level and the prop would be dead API on day one. Padding comes from `level` unless the site passes `padding`, which exists for the three table wrappers (`padding={0}`, they use `overflow-hidden` and pad their own cells) and `BriefStatCard`'s `"12px 14px"`.

`tone="alert"` exists so `BriefStatCard`'s deal-breaker variant can migrate; without it that site is a card shape the primitive cannot express. `dashed` serves `EmptyBrief` alone — kept as a boolean rather than a tone because the border *colour* is unchanged, only its style.

Class strings compose as `card card--{level} card--{tone}`, plus `card--dashed`. Consumer `className` is appended last, and `style` is spread after the computed padding so a caller can still override in a pinch.

## New token: `--card-hero-shadow`

`BriefHeader`'s box-shadow is currently the only reason it accepts a `theme` prop:

```ts
boxShadow: theme === "dark"
  ? "0 16px 34px rgba(0,0,0,0.44)"
  : "0 12px 30px rgba(17,17,17,0.11), 0 1px 2px rgba(17,17,17,0.05)"
```

Both values move into `index.css` as `--card-hero-shadow` (light in `:root`, dark in `.dark`), following the `--modal-shadow` precedent DS1 set. Same rendered pixels; `BriefHeader` then drops `theme` entirely, leaving `StatusPill` and `OverrideBadge` as the brief's only `theme` consumers — both genuine status-hue cases with no token equivalent.

`EmptyBrief` is `level="hero"` but has no shadow today. It will acquire one, since the shadow is attached to the level. This is intentional — the two hero cards occupy the same slot in the layout (one replaces the other depending on `scanStarted`) and should not differ in elevation.

## Call sites (18)

| # | Site | level | tone | padding | note |
|---|---|---|---|---|---|
| 1 | `BriefHeader` | hero | surface | — | drops `theme` |
| 2 | `EmptyBrief` | hero | surface | — | `dashed`; **p 24 → 20**; gains shadow |
| 3 | `BriefPanel` | panel | surface | — | keeps `minHeight: 220` via `style` |
| 4 | `ActionsPanel` | panel | surface | — | |
| 5 | `DiffPanel` | panel | surface | — | |
| 6 | `ThesisPanel` | panel | surface | — | |
| 7 | `FindingsPanel` | panel | surface | — | |
| 8 | `FinancialPanel` | panel | surface | — | |
| 9 | `EditableField` | inner | alt | — | **r 16 → 18**, **p "10px 12px" → 12** |
| 10 | `DiffRow` | inner | alt | — | **p "10px 12px" → 12** |
| 11 | `FindingsPanel` finding card | inner | alt | — | |
| 12 | `ThesisColumn` (empty) | inner | alt | — | keeps `minHeight: 110` |
| 13 | `ThesisColumn` (populated) | inner | alt | — | |
| 14 | `FinancialChart` | inner | alt | — | |
| 15 | `FinancialTableView` | inner | surface | `0` | `overflow-hidden` via `className` |
| 16 | `MetricsTable` | inner | surface | `0` | `overflow-hidden` |
| 17 | `SimpleFinancialTable` | inner | surface | `0` | `overflow-hidden` |
| 18 | `BriefStatCard` | inner | alt / alert | `"12px 14px"` | **r 20 → 18**; `alert` when `tone="alert"` |

**Not migrated:** pills and badges (`borderRadius` 99/999 — `StatusPill`, `SourcePill`, `CountBadge`, `FreshnessPill`, `DiffPill`, `SourceChip`, `SegmentedTabs`), the chart bars, and `EditableField`'s text input. Round-pill geometry is a different primitive; if it ever gets one, that is a separate plan.

## Deliberate visual changes (6)

Every other site must render byte-identically. These are the agreed cost of Card defining the geometry rather than parroting it:

1. `BriefStatCard` radius 20 → 18
2. `EditableField` radius 16 → 18
3. `EditableField` vertical padding 10 → 12
4. `DiffRow` vertical padding 10 → 12
5. `EmptyBrief` padding 24 → 20
6. `EmptyBrief` gains the hero shadow it lacks today

Items 3 and 6 were **not** in the design as first presented and were added while writing this spec, for consistency: 3 because snapping `DiffRow`'s `"10px 12px"` but not `EditableField`'s identical value would be arbitrary, and 6 because elevation follows the level and the two hero cards occupy the same layout slot. Both are flagged for review rather than folded in silently.

`--card-hero-shadow` is a change in mechanism but not in pixels for `BriefHeader`.

## Testing

`Card.test.tsx`, in the shape of `Button.test.tsx`:

- each `level` maps to its class and default padding
- each `tone` maps to its class
- `padding={0}` and `padding="12px 14px"` override the level default
- `dashed` adds its class
- consumer `className` is appended, not replaced
- `ref` reaches the underlying div and unknown div props pass through

## Verification

Split by risk, using the techniques these plans have already proven:

- **The 13 unchanged sites** — A/B computed-style diff (DS3b's technique, which beat screenshots for zero-change claims): render the old inline-style markup beside the new class string in the live page and diff `borderRadius` / `padding` / `backgroundColor` / `borderColor` / `borderStyle` in both themes. A screenshot cannot prove a 1px radius delta; this can.
- **The 5 changed sites** — explicit before/after screenshots in both themes, since these are *meant* to move. Reviewed, not just captured.
- Gates: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npx eslint src` (baseline 0 errors / 49 warnings).

In-app driving reuses the FE5.6 harness: `acme_saas` with a Playwright-mocked Proactive Scan run (no LLM call), plus the localStorage-seeded diff snapshot for `DiffPanel`/`DiffRow` and the open-then-Escape path for `EditableField`.

## Out of scope

- Card for workflows / docmatrix / manager / position pages, and any app-wide radius scale — needs a look decision, deliberately not taken here.
- The Input primitive (DS3's other deferral): 34 of 35 call sites reachable but 5 distinct treatments, so it carries the same unresolved visual decision.
- A Pill/Badge primitive.

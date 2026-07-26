# Oxblood/ivory reskin — design spec

**Date:** 2026-07-26
**Branch:** `feat/reskin-oxblood` (base layer committed as `03e6a9d`)
**Source artifact:** `frontend/design-system-spec.html`
**Status:** design approved; implementation plan to follow in `docs/todo/`

Repoints the app's visual layer from the cobalt/neutral system to the
oxblood/ivory system in the design artifact. Scope is **colour + typography**.
Radius and the landing page are explicitly out.

---

## 1. Why this is tractable

A measured spike (branch `spike/oxblood-token-swap`, retained as the
measurement record) swapped only `index.css` and `tailwind.config.js` — two
files, zero component changes — and scanned every rendered element's computed
colour against the new palette:

| Surface | Light | Dark |
|---|---|---|
| Portfolio | **0 off-palette** | **0 off-palette** |
| Deal workspace | 4 | 5 |
| Deal list (`/app`) | 18 | 19 |

Portfolio reskinned completely from tokens alone. That result is the premise of
this plan: the token layer is sound where components were migrated off
`ddTheme`, and the remaining work is bounded and enumerable rather than a
rewrite.

Two levers do disproportionate work and should be preserved as patterns:

- **`tailwind.config.js` colour aliases.** Repointing the `blue` scale to an
  oxblood ramp swept ~140 raw `blue-*` utility sites declaratively.
- **CSS custom properties consumed via Tailwind aliases** (`bg-surface`,
  `text-t1`, `border-edge`). Anything routed through these reskins for free.

Everything that broke was code that bypassed both.

---

## 2. Decisions

Six decisions were settled during design. Each is binding for implementation.

### D1 — Stage badges go ink-neutral; colour means severity only

The artifact is **not** single-hue. It defines a four-level badge system:

```css
.b-material { background:#f7e4e1; color:var(--sev-material) }  /* #c0392b */
.b-moderate { background:#f6ecd8; color:#9a6a1f }              /* #c98a2b */
.b-note     { background:#e2efe7; color:var(--sev-note) }      /* #2f6b4f */
.b-neutral  { background:var(--sand); color:var(--muted); border:1px solid var(--line) }
```

So "ink, ivory, and a single oxblood" governs brand and chrome, not functional
colour. The artifact permits colour that carries meaning. What it never defines
is a vocabulary for **stage identity** (teal Screening, cobalt Diligence,
violet IC).

`.b-neutral` — a badge whose entire semantic is "no severity" — is the
ready-made stage chip.

Decisive against the alternative (an oxblood intensity ramp for stages): the
artifact annotates `--soft: #f2e5e1` twice as *"oxblood tint fill (chips, active
docs)"* and *"Active doc uses soft-oxblood fill."* In this system oxblood tint
means **active/selected**. Rendering `DUE DILIGENCE` as `#f2e5e1` would make
"this row is selected" and "this deal is in diligence" the same colour.

**Consequence, accepted knowingly:** this is the only part of the plan users
will experience as a functional change rather than a restyle. Stage and
currency hues are a real scanning aid, and no contrast argument justifies
removing them — it follows from the decision to honour the artifact's
information model. Reversible by scoping D1 to stage badges and leaving
`matrixColumnConfig` hued.

### D2 — Text always ≥4.5:1; borders split decorative vs. data

The artifact's `--muted` and `--line` both regress accessibility fixes this
repo made deliberately. Resolution is per-token by role, not a blanket policy:

- **Text is held to 4.5:1 without exception.** `--muted #8a8478` measures
  **3.72:1** on white, **3.50:1** on `--surface-alt`, and **3.29:1** on sand
  `#f4f1ea` — which is both the app background and the `.b-neutral` chip fill
  adopted in D1. It ships as `#6f6a5e` (5.39 / 5.07 / 4.77), still clearly
  recessive.
- **Borders split by whether the line carries meaning.** The codebase already
  encodes this split and the distribution is correct: `--border` has ~160 call
  sites concentrated in data surfaces (`FinancialPanel`, `TabularEditor`,
  `MonitoringPanel`, run/compare views); `--border-light` has exactly 6, all
  decorative popover rules in `AddQuestionBar`, `ColumnConfigPopover`,
  `DocMatrixTable`.

  Therefore `--border` **carries the accessible weight** and stays the default,
  and `--border-light` carries the artifact's 10% hairline as the deliberate
  decorative opt-in. No reclassification of 160 sites is required.

  Concrete values. The legacy border `#b0b0a3` measured **2.19:1** on white.
  The artifact's 10% alpha measures **1.22:1**, and the spike's interim `0.16`
  only reaches **1.40:1** — neither preserves the fix. Matching the legacy
  requires:

  | token | light | dark |
  |---|---|---|
  | `--border` | `rgba(20,25,35,0.34)` ≈2.2:1 | `rgba(255,255,255,0.24)` ≈2.2:1 |
  | `--border-light` | `rgba(20,25,35,0.10)` ≈1.2:1 | `rgba(255,255,255,0.08)` ≈1.3:1 |

  Note the target is **2.2:1, not 3:1**. WCAG SC 1.4.11 asks 3:1 of meaningful
  non-text indicators, but the repo's own deliberate value never met that, and
  grid lines at 3:1 read as heavy rules in a dense table. Matching the
  pre-reskin weight is the defensible bar here; raising to 3:1 would be a new
  design decision, not a restoration.

  Token names stay as-is. Renaming to `--line-data` / `--line-decor` would
  touch 160 lines to buy nothing.

Note: the dark `--text-3 #7f938a` (harvested from the artifact's dark mockup)
already measures 5.0:1 on `--surface` and needs no change. Only the light value
fails.

### D3 — `--violet` collapses to ink; no second hue

`--violet` is not a stage colour. `theme.ts` documents it as *"the second
semantic hue (tabular workflows, derived citations, KV cells)"*, and every use
is a binary against `ACCENT`:

```tsx
color: citation.kind === "derived" ? VIOLET : ACCENT
```

Given the product invariant that every claim carries a citation, the
derived-vs-quoted distinction is product-critical, so this was evaluated on
evidence rather than deferred to the artifact's silence.

A harmonised plum was derived and rejected. Candidates were searched across
hue 300–340 under the constraint that the colour pass 4.5:1 on white,
`--surface-alt`, and as a fill carrying ivory. The best qualifying candidate
(`#683156`) separates from oxblood by only **1.54:1**, and **1.73:1** under
simulated deuteranopia — near-identical luminance, differing mainly in hue,
which is exactly the cue colour-vision-deficient users cannot resolve.

Ink outperforms it:

| pair | normal | deuteranopia |
|---|---|---|
| oxblood vs **ink `#2b3646`** | **1.94:1** | **2.51:1** |
| oxblood vs best plum `#683156` | 1.54:1 | 1.73:1 |

`--violet` → `#2b3646` light, `#c5d0ca` dark, permanently. Zero call-site
changes; the token indirection absorbs it. The existing comment block framing
this as a "forced decision" is rewritten as a deliberate one.

### D4 — Scope is colour + typography

In: everything in §3 and §5. Out: the ~200 inline `borderRadius` values across
16 distinct sizes, and the landing page's separate `--landing-*` system
(CLAUDE.md records the landing copy as intentional pending work).

### D5 — Full font-family swap

The artifact changes all three families, not just the scale:

```
--sans   'Hanken Grotesk'    (app currently: IBM Plex Sans)
--serif  'Playfair Display'  (app currently: none)
--mono   'DM Mono'           (app declares it, never loads it)
```

**Latent bug confirmed:** `index.css:190` sets `.font-mono-dm` to DM Mono, but
the `@import` on line 1 fetches only IBM Plex Sans and IBM Plex Mono. All 9
call sites — financial tables, page-cited counts, flag IDs — have been
silently rendering in `ui-monospace`.

The app already loads fonts via a Google Fonts `@import`, so adding families
needs no new infrastructure. The risk is metric change: Hanken Grotesk has
different x-height and advance widths than IBM Plex Sans, so fixed-width
columns, truncation points, and `whiteSpace: nowrap` cells can reflow. This is
not scanner-detectable and drives the Phase 2 verification method in §6.

### D6 — Artifact scale verbatim, extended downward for the dense tier

The artifact's scale bottoms out at 11px with nothing between 11 and 13.5:

| token | family | size/LH | weight | use |
|---|---|---|---|---|
| `--text-display` | Playfair | 52/54 | 600 | hero |
| `--text-h1` | Playfair | 38/40 | 600 | page title |
| `--text-h2` | Playfair | 28/32 | 600 | sub-section |
| `--text-h3` | Playfair | 22/28 | 600 | card title |
| `--text-body` | Hanken | 15/24 | 400 | paragraph |
| `--text-sm` | Hanken | 13.5/20 | 400/600 | UI, secondary |
| `--text-meta` | DM Mono | 11/16 | 400/500 | labels, data |

The app's measured distribution across 384 inline `fontSize` values:

```
 8px    4     13px   37     20px   6
 9px   23     14px   18     21px   2
10px  108     15px    3     24px   2
11px   82     16px    5     26-31  4
12px   87     18px    3
```

Plus `text-[10px]` ×65, `text-[11px]` ×19, `text-[9px]` ×7, `text-sm` ×86,
`text-xs` ×47. **Roughly 430 sites sit at 12px or below** — the dense data UI
of a diligence tool.

Mapping those onto the artifact's floor would mean 173 sites at 10px growing
to 13.5px (**+35%**), 87 sites at 12px growing 12.5%, and 34 sites at 8–9px
growing up to 37%. Rows get taller, columns wider, fewer rows per screen. The
artifact was drawn as an editorial showcase, not against a 20-column matrix.

Resolution: adopt all seven tokens verbatim, and add three **documented
app-side extensions** for data-dense surfaces:

| token | family | size/LH | use |
|---|---|---|---|
| `--text-xs` | Hanken | 12/16 | dense UI |
| `--text-2xs` | Hanken | 10/14 | dense meta |
| `--text-meta-sm` | DM Mono | 10/14 | dense data/labels |

These are marked in `index.css` as extensions the artifact does not cover, not
passed off as spec. The migration maps every site onto the ten tokens **at its
current size**; the extension exists precisely so nothing resizes. The only
intentional size changes are headings adopting Playfair.

---

## 3. Colour token architecture

No new token names and no structural change. The existing 44-token layer is the
right shape — the spike proved it by reskinning portfolio to zero off-palette
without touching a component. Changes are values plus the two semantic
clarifications in D2.

### Files that bypass the token layer

These are why the deal list did not reskin. Each hardcodes pre-reskin
neutrals and must route through tokens:

| File | Holds |
|---|---|
| `pages/HomePage.tsx` | `#0f0f0f` — the old app canvas, why `/app` stayed cold neutral |
| `components/home/HomeSidebar.tsx` | `#151515`, `#262626` |
| `components/home/DealListItem.tsx` | `#151515`, `#262626` |
| `components/dd/CitationPanel.tsx` | `isDark ? "#f5f5f5" : "#111111"` — hand-reimplemented tokens |
| `components/DocumentViewer.tsx` | `#101010`, `#f5f5f5` |

`components/workflows/theme.ts` additionally exports `AMBER = "#f59e0b"` and
`GREEN = "#22c55e"` as raw hex. These retokenize onto `--status-warning` /
`--status-good` and account for the workspace's stray off-palette hits.

---

## 4. Badge system

Four categorical palettes collapse to two vocabularies.

**Severity — keeps colour.** `--sev-material` / `--sev-moderate` / `--sev-note`
/ neutral, per the artifact's `.b-*` classes. `theme.ts`'s `AMBER` and `GREEN`
retokenize here.

**Identity — goes ink-neutral.** `lib/stageBadges.ts` collapses from 9 stages ×
2 themes × 3 properties (54 hand-tuned values) to two chip styles: sand/ink for
active stages, inverted ink for terminal ones (`Closed`, `Committed`).
Consumers: `dd/TopBar.tsx`, `home/DealListItem.tsx`, `pages/ManagerPage.tsx`.

`lib/matrixColumnConfig.ts` loses its currency hues (USD green, EUR blue, GBP
purple, CAD teal, CNY amber) and column-type hues (blue/amber/rose) in favour
of neutral chips. Nine consumer files: `docmatrix/{AddQuestionBar,
ColumnConfigPopover, DocMatrixCell, DocMatrixTable, MatrixAskHero}`,
`workflows/cells/ShapeControls`, `workflows/tabular-run/{ColumnEditMenu,
RunTable}`, `workflows/TabularEditor`.

The existing contrast documentation in `stageBadges.ts` (≥7.3:1 label-on-chip)
must be preserved and re-verified for the replacement styles, not dropped.

---

## 5. Dark theme

The artifact **specifies only 6 dark values** (`--ivory`, `--paper`, `--ink`,
`--oxblood`, `--sand`, `--line`). This app's dark theme needs ~25. The gap is
roughly 19 tokens and is itself a finding: the artifact underspecifies the
product's dark mode.

Derivation rule, applied in order:

1. Use the artifact's 6 explicit dark values.
2. Use the 4 harvested from its dark demo markup — `--text-2 #c5d0ca`,
   `--text-3 #7f938a`, accent tint `rgba(196,122,95,.18)`, `--on-accent
   #0e1a17`. Harvesting beats inventing.
3. Derive the remainder from each token's **light-mode role** at matched
   contrast against the `#0e1a17` ground, then contrast-check every result.

Tokens resolved by rule 3 — `--text-4`, `--table-zebra`, `--table-header`, the
status scale and its tints, the danger tints, `--accent-strong`,
`--accent-tint-border`, `--modal-scrim`, `--modal-shadow`,
`--card-hero-shadow` — are **marked in `index.css` as derived and awaiting the
design author's sign-off**. They must stay visibly provisional rather than
passing as specification.

---

## 6. Verification

**Phase 1 (colour) is mechanically verifiable.** The alpha-aware
computed-style scanner must report **0 off-palette colours** on `/app`,
`/deal/:id`, and `/portfolio` in both themes. The scanner must keep its
alpha-aware key — collapsing `rgba(255,255,255,.14)` to `#ffffff` produces
false positives against the new `--border`.

**Phase 2 (typography) is not.** Family swaps change metrics, which no colour
scanner detects. Verification is before/after screenshots on the four
data-dense screens — `dd/brief/FinancialPanel`, `docmatrix/DocMatrixTable`,
`workflows/TabularEditor`, `workflows/tabular-run/RunTable` — checking
specifically for row reflow, label truncation, and column overflow.

Both phases must keep `npx tsc --noEmit`, `npm run build`, and the 188-test
suite green, with the ESLint warning count at or below its current baseline.

---

## 7. Phasing

Two phases, deliberately separated because they have different verification
methods and different risk profiles. Phase 1 is shippable alone.

**Phase 1 — colour**

1. `index.css` token values (D1–D3), `tailwind.config.js` already done in `03e6a9d`
2. The five files hardcoding old neutrals (§3)
3. `theme.ts` — retokenize `AMBER` / `GREEN`
4. `lib/stageBadges.ts` — ink-neutral chips
5. `lib/matrixColumnConfig.ts` — neutral chips
6. Dark-theme gap resolution (§5)
7. Scan to zero

**Phase 2 — typography**

1. Font loading — add Hanken Grotesk, Playfair Display, DM Mono; fix the
   `.font-mono-dm` bug
2. Scale tokens (D6) + Tailwind aliases
3. Sweep inline sites by tier, largest-first
4. Visual A/B on the four dense screens

If Phase 2 reveals that Hanken's metrics damage the matrix tables, stopping
after Phase 1 leaves a finished, verified reskin rather than a half-migrated
one. That optionality is the reason for the split.

---

## 8. Open items

- **~19 derived dark tokens** (§5) need the design author's sign-off. They are
  implementable now and marked provisional in source; this is not a blocker.
- **D1's scanning cost** is a product judgement that may want validation
  against real usage — whether people scan the deal list by stage hue. The
  artifact cannot answer it and it did not block the decision.
- **`spike/oxblood-token-swap`** is retained as the measurement record and
  should not be merged.

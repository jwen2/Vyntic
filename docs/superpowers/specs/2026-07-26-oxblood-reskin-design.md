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

### D1 — Badge colour becomes admin-configurable from a curated palette

**Superseded the original D1** (ink-neutral stages, colour reserved for
severity) after review: users need visual differentiation between funds and
stages, and flattening every chip to sand removes a real scanning aid.

Badge colour becomes **data an admin sets**, chosen from a fixed palette of 8
tokenized colours — not a free hex picker. The curated set is what keeps this
from dissolving the design system:

- every option is a token with light + dark values, so dark mode works by
  construction rather than by runtime derivation from arbitrary input;
- contrast is verified once at design time instead of computed per badge;
- the palette is finite and known, so the Phase 1 zero-off-palette gate
  survives — the scanner whitelists 48 known values, not "whatever users pick".

**The palette.** Hues spread around the wheel but held desaturated and warm
enough to sit beside oxblood, which leads the set. All values derived and
verified programmatically; **worst label contrast 7.01:1, worst border 2.2:1,
zero failures** across 16 theme/colour combinations.

| name | light bg / fg / edge | dark bg / fg / edge |
|---|---|---|
| oxblood | `#f8efed` `#8d3020` `#db9f95` | `#401d17` `#e5a59a` `#894134` |
| clay | `#f8f2ed` `#6f4725` `#c9a98d` | `#302318` `#d2a884` `#6c5037` |
| ochre | `#f7f5ed` `#5e4f21` `#bdac7a` | `#2c2617` `#c9b373` `#605534` |
| moss | `#f2f6ee` `#3e5b29` `#9ab587` | `#20281a` `#99bf7d` `#4a5c3d` |
| sage | `#eff6f2` `#2d5c45` `#91b6a3` | `#1d2a24` `#88bfa3` `#425c4f` |
| teal | `#eef5f6` `#2c5963` `#90b4bb` | `#1c292c` `#87bac4` `#3f5a5f` |
| slate | `#eef2f6` `#365278` `#a0b0c5` | `#202832` `#9fb4d0` `#47576b` |
| plum | `#f6eef4` `#783662` `#c7a3bb` | `#32202c` `#d2a3c2` `#714b65` |

**Known limitation.** moss, sage, and teal sit at effectively identical
luminance (1:1), so they separate by hue alone — indistinguishable under
deuteranopia if an admin happens to pick two of them for adjacent items. This
is accepted because a badge always carries a text label, making colour a
*redundant* channel rather than the sole one. Luminance was deliberately kept
uniform across the palette so no colour reads as louder than another; staggering
it would fix the CVD case at the cost of making some chips visually dominant.
Revisit if users report confusion.

**Scope consequence.** This is no longer purely a reskin. Colour-as-data needs
storage, an admin route, and a picker UI. Per CLAUDE.md, mutations are
admin-only behind `require_admin`, and migrations are additive-only. The
palette and the `stageBadges.ts` refactor belong to this plan; **the persistence
layer and picker UI are a separate feature plan** that builds on them. The
refactor is identical either way — what changes is only whether the value comes
from a constant or from a row.

### D1-orig — superseded: ink-neutral stages (retained for rationale)

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

**Why it was superseded:** the reasoning above is sound about the *artifact*
but wrong about the *product*. Stage and currency hues are a real scanning aid,
and no contrast argument justified removing them. The curated palette in D1
honours the artifact's discipline (finite, tokenized, contrast-verified) without
paying that cost.

**One constraint that survives.** The `--soft` collision is still real: oxblood
tint means *active/selected* throughout the app. The palette's `oxblood` option
(`#f8efed` light) is close to `--soft` (`#f2e5e1`), so an oxblood badge sitting
in a selected row may read ambiguously. Either drop `oxblood` from the
selectable set and keep it reserved for interaction state, or verify the two
read distinctly in situ before shipping. Flagged for implementation, not
resolved here.

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

**Identity — becomes palette-driven.** `lib/stageBadges.ts` stops owning colour
values. Its 54 hand-tuned constants (9 stages × 2 themes × 3 properties) are
replaced by a lookup from a stage to one of the 8 palette tokens in D1, with the
`{bg, fg, edge}` triple resolved from CSS vars rather than hardcoded per theme.
Defaults preserve today's rough hue assignments where a palette colour is close
(Screening→sage, Diligence→slate, IC→plum, Monitoring→moss, terminal→ink), so
nothing shifts unrecognisably before an admin customises anything. Consumers:
`dd/TopBar.tsx`, `home/DealListItem.tsx`, `pages/ManagerPage.tsx`.

`lib/matrixColumnConfig.ts` moves its currency and column-type chips onto the
same palette tokens, replacing raw Tailwind utility strings (`bg-blue-100
text-blue-700 dark:…`) with palette classes. The hues stay — they just come from
the system instead of from Tailwind's default scale. Nine consumer files:
`docmatrix/{AddQuestionBar, ColumnConfigPopover, DocMatrixCell, DocMatrixTable,
MatrixAskHero}`, `workflows/cells/ShapeControls`,
`workflows/tabular-run/{ColumnEditMenu, RunTable}`, `workflows/TabularEditor`.

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
`--card-hero-shadow` — **ship as implemented values**, not as blockers. Each is
commented in `index.css` as derived rather than specified, so the provenance
stays honest and the design author can revise any of them later without
archaeology. Phase 1 does not wait on sign-off.

---

## 6. Verification

**Phase 1 (colour) is mechanically verifiable.** The alpha-aware
computed-style scanner must report **0 off-palette colours** on `/app`,
`/deal/:id`, and `/portfolio` in both themes. The scanner must keep its
alpha-aware key — collapsing `rgba(255,255,255,.14)` to `#ffffff` produces
false positives against the new `--border`.

The scanner's whitelist grows by the **48 badge-palette values** from D1 (8
colours × 2 themes × 3 properties). This is exactly why the palette is curated
rather than free-form: the gate stays enforceable because the set of legal
colours remains finite and known. A free hex picker would make the badge
surface permanently unscannable.

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

1. `index.css` token values (D2, D3), `tailwind.config.js` already done in `03e6a9d`
2. The 8-colour badge palette as tokens (D1), light + dark
3. The five files hardcoding old neutrals (§3)
4. `theme.ts` — retokenize `AMBER` / `GREEN`
5. `lib/stageBadges.ts` — palette-driven lookup replacing 54 constants
6. `lib/matrixColumnConfig.ts` — palette classes replacing Tailwind utilities
7. Dark-theme gap resolution (§5) — implemented, commented as derived
8. Scan to zero, with the 48 palette values whitelisted

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

- **Badge persistence and picker UI** are deliberately out of this plan. D1
  delivers the palette and makes `stageBadges.ts` data-shaped; storing an
  admin's choice needs a store, an additive migration, an admin-only route, and
  a picker — a separate feature plan. Until it exists, stage→colour mapping
  stays a constant in the frontend, just one that reads from palette tokens.
- **The `oxblood` palette option vs. `--soft`** (see D1-orig) — decide at
  implementation whether to reserve oxblood for interaction state and ship 7
  selectable colours instead of 8.
- **moss / sage / teal share luminance** and separate by hue alone. Accepted
  because badges always carry text labels. Revisit if users report confusion.
- **~19 derived dark tokens** (§5) ship implemented and commented as derived.
  The design author can revise them later; nothing blocks on that.
- **`spike/oxblood-token-swap`** is retained as the measurement record and
  should not be merged.

# Landing hero — Ivory palette, and a preview table that matches the real grid

**Date:** 2026-08-01
**Scope:** `frontend/src/components/landing/HeroSection.tsx` + one scoped token block in `frontend/src/index.css`
**Source mockup:** the `01 · Ivory` landing frame of the "Vyntic · Palette Applied" artifact
**Branch:** `feat/landing-ivory`

Brings the landing hero onto the palette the app already ships, and rebuilds its
dashboard-preview table so it reproduces the real interactive grid instead of a
generic marketing table.

---

## Why this is smaller than it looks

The oxblood reskin already landed in the app. `index.css` defines `--accent:
#a3402f`, `--accent-tint: #f2e5e1` and `--status-good: #2f6b4f`, and already
loads Playfair Display, Hanken Grotesk and DM Mono as `--serif` / `--sans` /
`--mono`. Every value in the mockup's `.pal-ivory` block is a value the app
already has.

**The landing page is the one surface the reskin never reached.** It runs on a
separate, older namespace — `--landing-bg: #f3f3ee`, `--landing-text: #111111`
(flat black, not ink navy), `--landing-border: #b0b0a3` (a heavy rule where the
mockup uses a 10%-alpha hairline), and no accent token at all.

So this is not a new palette. It is the landing page catching up to the app.

---

## Decisions

| # | Decision | Rejected alternative |
|---|---|---|
| D1 | **Hero only.** `HeroSection.tsx`. `LandingNav` and the eleven sections below it are untouched. | Nav + hero together (nav restyling is part of the deferred pass). Whole page (too large to review as one change). |
| D2 | **Copy is frozen.** Same headline, body, buttons, proof points. Treatment changes; words do not. | Adopting the mockup's copy — it is buyout-era ("AI-Powered Deal Intelligence", email capture, "Free for up to 3 deals") and would pre-empt the LP repositioning that `CLAUDE.md` calls deliberate pending work. |
| D3 | **Tokens scoped to a `.landing-ivory` wrapper**, not `:root`. | Re-valuing globally — `--landing-*` feeds all thirteen landing components, so sections tuned around the `#b0b0a3` border would look washed out until the follow-up pass. |
| D4 | **`--landing-muted` is `#6f6a5e`, not the mockup's `#8a8478`.** | The mockup value verbatim: 3.29:1 on ivory, below the 4.5:1 AA body threshold, and today's hero uses muted at body size. |
| D5 | **Static table mock, no import of `grid-table.css`.** | Importing the live `RunTable` — pulls import-order constraints and run-state logic into the marketing bundle. |
| D6 | **Citation markers take the real form (`[S1]`), not the mockup's filled pill.** | The mockup's `.cite` chip — it does not match what the product renders. |

---

## 1. The scoped token block

Added to `index.css`, applied by a single wrapper class on the hero's outermost
element.

```css
.landing-ivory {
  --landing-bg: #f4f1ea;
  --landing-text: #16202e;          /* ink navy — 14.54:1 on bg */
  --landing-muted: #6f6a5e;         /* AA substitute — 4.77:1 on bg, 5.39:1 on white */
  --landing-border: rgba(20, 25, 35, 0.10);
  --landing-surface: #ffffff;
  --landing-surface-alt: #faf8f3;
  --landing-accent: #a3402f;        /* new */
  --landing-accent-soft: #f2e5e1;   /* new */
  --landing-good: #2f6b4f;          /* new */
}
```

Measured contrast, all against `#f4f1ea` unless noted:

| pair | ratio | AA body |
|---|---|---|
| ink `#16202e` | 14.54 | pass |
| muted `#6f6a5e` | 4.77 | pass |
| muted on white | 5.39 | pass |
| accent `#a3402f` | 5.59 | pass |
| accent on white | 6.30 | pass |
| good `#2f6b4f` | 5.58 | pass |
| *(rejected)* `#8a8478` | 3.29 | **fail** |

The `6.30` figure independently reproduces the value already asserted in
`index.css`'s own comment, which is why these numbers are trusted.

**Promotion path.** When the remaining sections are restyled, move the block's
body to `:root`, delete the wrapper class and its use. No component changes.

## 2. Hero restyle

Structure and copy stay. What changes:

- **Headline** — `--serif` (Playfair Display) at hero scale, `-0.02em` tracking,
  `1.04` line-height. The second clause takes `--landing-accent`, matching the
  mockup's two-tone treatment.
- **Eyebrow** → the mockup's pill: `--landing-accent-soft` fill, hairline border,
  a 6px filled accent dot, accent text.
- **Borders** — every `--landing-border` consumer in the hero inherits the
  hairline automatically via the wrapper.
- **Proof-point cards** — hairline border, `--landing-surface`, unchanged copy.

The mockup's email-capture field and its "No credit card required" line are not
adopted (D2).

## 3. The preview table

The part the request is actually about. Today's mock styles headers as
`uppercase tracking-[0.14em] text-[10px]`. **The real grid looks nothing like
that.** From `components/ui/grid-table.css` and `tabular-run/styles.ts`:

| aspect | real grid | today's mock |
|---|---|---|
| header font | `11px` `var(--mono)`, weight **400** | 10px uppercase, `0.14em` tracking |
| header padding | `7px 12px 7px 9px`, top-aligned | uniform `p-3` |
| row height | fixed `38px`, middle-aligned | free |
| body padding | `8px 10px` | `p-3` |
| zebra | alternate rows `var(--zebra)` | none |
| first column | sticky, right border, depth shadow | plain |
| citations | `[S1]` 9px mono 700 accent | none |

The rebuilt mock reproduces the left column: mono-400 headers at the real
padding, 38px rows, zebra striping, and a first column that reads as a pinned
divider with its right border and shadow. Citation markers appear under values
in the form `CellRenderer.tsx` renders them — bracketed, 9px, mono, weight 700,
`--landing-accent`, capped at four.

Rows stay Brightwater IV and Glenmoor III; they are the LP corpus already seeded
and already in the current mock. Columns keep today's four — Deal, Revenue
quality, Risk, IC note — so no copy decision is smuggled in under a styling
change (D2).

**Known trade-off (D5).** A static copy drifts from the real grid as the grid
changes. Mitigation is a comment in both `grid-table.css` and the hero pointing
at each other, so whoever edits the grid learns a marketing copy exists. This is
a deliberate trade of sync for isolation, not an oversight.

## Verification

- `npx tsc --noEmit && npm run build`
- The `frontend:verify` skill: screenshot the hero at desktop and mobile widths.
- **Regression check that matters:** confirm the eleven sections below the hero
  are pixel-unchanged. That is the whole claim of D3, and it is the one thing a
  scoped token block can get wrong.

## Out of scope

- `LandingNav` and all sections below the hero — the follow-up pass
- Any copy change, including LP repositioning
- Dark mode: the landing page is light-only today and stays so
- Reconciling the mock with `grid-table.css` at build time

## Known limitations

- **The mock can drift.** See D5.
- **`.landing-ivory` is a second palette in flight.** Until the follow-up pass,
  the page carries two token values for the same names in different subtrees.
  This is intentional and time-boxed, but it is real, and the promotion step
  should not be left indefinitely.

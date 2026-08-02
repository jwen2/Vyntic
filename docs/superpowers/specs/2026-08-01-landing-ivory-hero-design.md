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
| D7 | **`--landing-border` is `rgba(20,25,35,0.36)`** — ink-navy hue at the logged 2.2:1 floor. | The mockup's `rgba(20,25,35,0.10)`: 1.22:1, *fainter than the `#d6d6cc` (1.46:1) already tried and rejected*. See below. |

| D8 | **Hero is a single centered column, preview table below the copy.** | The current two-column grid (copy left, panel right). Added 2026-08-01 after reviewing the shipped hero against the mockup. |
| D9 | **New `ink` variant on `LandingButton`, used in the hero only.** Ink navy fill, ivory text. | Repointing the shared `primary` variant (turns every landing button ink, including the nav and the eleven un-restyled sections). Appending a `bg-*` utility at the call site (no `tailwind-merge`, so it resolves by stylesheet order — the same hazard D-note records for the headline). |

| D10 | **The header joins `.landing-ivory` and takes the mockup's treatment**: bare Playfair wordmark, sentence-case 13.5px links, compact ink CTA. Our labels are kept. | Leaving the header on the old palette (it sits directly above a restyled hero, so the seam is the most visible on the page). |
| D11 | **`--landing-inverse` / `--landing-inverse-text` respecified to `#16202e` / `#f4f1ea`** inside `.landing-ivory`. | Leaving them unset — the earlier ruling, made when only the hero was in scope. |

### D10, stated plainly

Scope grew on owner request after seeing the restyled hero beneath an
unrestyled header. The header gets `landing-ivory` on its own `<header>`; the
hero keeps it too. Both are scoped, so the eleven sections below still resolve
`:root`.

Three things change beyond color:

- **The logo becomes a bare `Vyntic` wordmark** in Playfair 600 at 24px. The
  rounded "V" badge and the "Deal Intelligence" subtitle are removed. This is
  the only authorized copy deletion on this branch, approved explicitly.
- **Nav links drop the mono/uppercase/tracked treatment** for the mockup's
  13.5px, weight 500, ink at 0.78 opacity. **Labels are unchanged** — Pilot,
  Workflow, Use Cases, Controls, not the mockup's Product/Solutions/
  Customers/Pricing.
- **`LandingButton` gains a `size` prop** (`default` | `compact`). `default`
  reproduces today's class string byte-for-byte so existing consumers are
  untouched; `compact` matches the mockup's 13px / `8px 15px` / `9px` radius.
  A className override at the call site was rejected for the usual reason:
  no `tailwind-merge`, so `rounded-full` vs `rounded-[9px]` would resolve by
  stylesheet order.

### D11, stated plainly

This **reverses the earlier deferral** of the inverse tokens, and the reason it
is now safe is exactly the reason it was deferred before.

The final review argued against respecifying them hero-only: `--landing-inverse`
paints the announce band above the hero and the footer below it, so an override
scoped to the hero would leave the IC Summary panel diverging from the band
sitting directly above it. With D10 bringing the header inside the same class,
the band and the panel now move together — the objection is satisfied rather
than overridden. The footer and `FinalCTA` keep the `:root` values until their
own pass, which is a seam far down the page rather than at the fold.

Ivory `#f4f1ea` on ink `#16202e` is 14.54:1.

### D8, stated plainly

The mockup's hero is `flex-direction: column; align-items: center; text-align:
center` with the preview panel beneath the copy. The shipped hero kept the
pre-existing two-column grid, so the table sat in a ~440px column — which is
why its columns wrap. Moving it below the copy roughly doubles its width and,
combined with the 13px body size restored in the final fix wave, is what gets
row density near the real grid's.

Order within the hero, following the mockup: eyebrow pill → headline → body →
buttons → proof points → preview table. The mockup's small-print line sits
immediately above its panel; the proof-point cards take that slot.

**The panel does not bleed off the bottom edge.** The mockup uses
`border-radius: 12px 12px 0 0` to run the panel past the frame; the shipped
version keeps a fully contained card with all four corners rounded. Decided by
the project owner — bleed interacts badly with the section below at mobile
widths.

### D9, stated plainly

The mockup's `.btn-primary` is `background: var(--ink); color: var(--bg)` — ink
navy fill, ivory text. Oxblood appears only on the pill, the headline's second
clause, and the citation markers; never as a button fill. `LandingButton`'s
`primary` variant is `bg-[var(--accent)]`, which is why the hero's buttons ship
oxblood.

`LandingButton` is consumed by `LandingNav`, `FinalCTA`, `PricingSection` and
others, all outside `.landing-ivory`. Repointing `primary` would restyle them
all. The variant is therefore **additive**: existing consumers are untouched,
and the follow-up pass can switch them over deliberately.

### D7, stated plainly

`index.css:11` carries a logged decision on `--landing-border: #b0b0a3`:

> ~2.2:1 against white surfaces — panel edges must stay visible on washed-out
> displays (was #d6d6cc at 1.46:1).

Measurement confirms it: `#b0b0a3` is **2.19:1** on white. The mockup's hairline
composites to `#e8e8e9` at **1.22:1** — worse than the value that decision
already rejected. Taking the artifact verbatim would silently reverse a
conclusion someone reached after hitting the problem in production.

`rgba(20,25,35,0.36)` holds the 2.2:1 floor (2.27:1 on white, 2.24:1 on ivory)
while moving the hue from warm sand to ink navy. The hero reads cooler and
lighter than today without losing edge visibility. The mockup's delicate
hairline character is deliberately not reproduced.

---

## 1. The scoped token block

Added to `index.css`, applied by a single wrapper class on the hero's outermost
element.

```css
.landing-ivory {
  --landing-bg: #f4f1ea;
  --landing-text: #16202e;          /* ink navy — 14.54:1 on bg */
  --landing-muted: #6f6a5e;         /* AA substitute — 4.77:1 on bg, 5.39:1 on white */
  --landing-border: rgba(20, 25, 35, 0.36);   /* 2.27:1 on white — see D7 */
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

Borders are judged against the logged 2.2:1 visibility floor, not AA:

| border | on white | on ivory |
|---|---|---|
| today `#b0b0a3` | 2.19 | 1.94 |
| **chosen** `rgba(20,25,35,.36)` | 2.27 | 2.24 |
| *(rejected)* mockup `.10` | 1.22 | 1.22 |

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
- **Borders** — every `--landing-border` consumer in the hero picks up the
  ink-navy rule automatically via the wrapper (D7); no per-element edits.
- **Proof-point cards** — same border, `--landing-surface`, unchanged copy.

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

---

## Amendment — below-the-fold pass (2026-08-02)

Owner-directed, after the header restyle landed. Chosen scope: **palette +
geometry**, explicitly not layout. The mockup has an Ivory *landing* frame and
an Ivory *app* frame and nothing else, so any restructuring of the sections
below the hero would have been invention rather than matching. That option was
offered and declined.

**D12 — `.landing-ivory` is promoted to the page shell.** It now sits on
`LandingPage`'s `landing-shell` wrapper instead of `HeroSection`. This closes
the "two palettes in flight" limitation recorded above. It is *not* promoted to
`:root`, because `LoginPage` and the deal workspace still consume the original
`:root` values; the class is what keeps the blast radius at one page.

Consequence: `.landing-shell`'s gradient is written in literal hex
(`#f8f8f4` → `var(--landing-bg)`, plus an `rgba(17,17,17,0.04)` veil), so under
ivory it faded to a colder grey than `--landing-bg`. A
`.landing-ivory.landing-shell` rule restates both stops in ivory. This also
resolves the hero seam logged during Task 6 verification — the hero section is
`bg-transparent` and was painting the cold shell.

**D13 — content cards move to a 12px corner via an additive `radius` prop.**
`LandingPanel` gains `radius: "panel" | "card"`. `panel` (the original
`rounded-[1.5rem] sm:rounded-[2rem]`) stays the default and continues to serve
the hero preview and `LoginPage`; `card` (`rounded-xl`) is what the sections
below the fold pass. Additive rather than a default change, for the same reason
`LandingButton.size` and `LandingInput.inputSize` were: the primitives have call
sites outside the landing page.

**D14 — `LandingEyebrow` gains a real `tone` prop.** `FinalCTA` previously
coloured its eyebrow by passing `text-white/55` through `className`, competing
with the component's own `text-[var(--landing-muted)]`. This project has no
`tailwind-merge`, so the winner is decided by stylesheet order, not string
order — and on the ink band the base class won, measuring **1.8:1**. Through
the prop it measures **5.31:1**. Anywhere a primitive owns a colour, the
override belongs in the component, not in a caller's class string.

**D15 — hero CTAs become the mock's email capture.** "Pilot one deal" /
"View workflow" are replaced by the mockup's 440px inline row: a `field`-sized
`LandingInput` plus an ink `Get started` button. Submit is `preventDefault`ed —
presentational until a signup endpoint exists. The mockup's
"No credit card required · Free for up to 3 deals" microcopy is deliberately
*not* carried over; it makes pricing claims Vyntic has not made.

**D16 — header CTA copy is "See a demo"** (mock wording), desktop and mobile
menu both. The three hero proof-point cards and the three workflow-section
"Discuss a pilot" buttons are removed at owner request — the page had five
"Discuss a pilot" instances above the final CTA.

### Superseded

- "Out of scope: `LandingNav` and all sections below the hero" — done, D10/D12.
- "Known limitation: two palettes in flight" — closed by D12.

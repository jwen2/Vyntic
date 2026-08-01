# Landing Ivory Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the landing hero onto the Ivory palette the app already ships, and rebuild its preview table so it reproduces the real interactive grid.

**Architecture:** One scoped CSS class (`.landing-ivory`) re-values the `--landing-*` custom properties for the hero subtree only, so the eleven sections below it are untouched. `HeroSection.tsx` gains the wrapper class, serif/accent treatment, and a rewritten preview table whose chrome mirrors `components/ui/grid-table.css` by copy rather than by import.

**Tech Stack:** React 18 + TypeScript, Tailwind (utilities only — the project has no `tailwind-merge`), plain CSS custom properties, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-01-landing-ivory-hero-design.md`

## Global Constraints

- **Copy is frozen.** No headline, body, button, proof-point, column-header or row-label text changes. Treatment only. (Spec D2)
- **Scope is `HeroSection.tsx` + `index.css` only.** `LandingNav.tsx` and the eleven sections below the hero must not be modified. (Spec D1)
- **Tokens go on `.landing-ivory`, never `:root`.** (Spec D3)
- **`--landing-muted` is `#6f6a5e`**, not the mockup's `#8a8478` (3.29:1, fails AA body). (Spec D4)
- **`--landing-border` is `rgba(20, 25, 35, 0.36)`**, not the mockup's `0.10` (1.22:1, below the logged 2.2:1 floor at `index.css:11`). (Spec D7)
- **Do not import `components/ui/grid-table.css`** into the landing page. (Spec D5)
- **Citation markers render as `[S1]`** — 9px, `var(--mono)`, weight 700, accent-colored, no background, no border. Not a filled pill. (Spec D6)
- **Vitest runs with `globals: false`** (`vite.config.ts:33`), so every component test must `import { afterEach }` and call `afterEach(cleanup)` explicitly or renders accumulate across tests.

---

### Task 1: The scoped token block

Adds `.landing-ivory` to `index.css`. No component consumes it yet, so this task is provably inert — which is the point: it can be reviewed for correctness of values alone.

**Files:**
- Modify: `frontend/src/index.css` (append after the `:root` block ending at line ~30)

**Interfaces:**
- Produces: CSS class `.landing-ivory`, re-valuing `--landing-bg`, `--landing-surface`, `--landing-surface-alt`, `--landing-border`, `--landing-text`, `--landing-muted`, and adding `--landing-accent`, `--landing-accent-soft`, `--landing-good`. Task 2 and Task 3 consume these by name.

- [ ] **Step 1: Add the block**

Append to `frontend/src/index.css`, immediately after the closing brace of the `:root` block that defines the `--landing-*` and `--accent` tokens:

```css
/* Ivory palette for the landing hero, scoped rather than applied at :root so
   the eleven sections below the hero keep their current appearance until the
   follow-up restyle. To promote: move this body into :root, delete the class,
   and drop the wrapper in HeroSection.tsx.
   Spec: docs/superpowers/specs/2026-08-01-landing-ivory-hero-design.md */
.landing-ivory {
  --landing-bg: #f4f1ea;
  --landing-surface: #ffffff;
  --landing-surface-alt: #faf8f3;
  /* Ink-navy hue at the logged 2.2:1 visibility floor (2.27:1 on white). The
     source mockup used 0.10 alpha, which composites to 1.22:1 — fainter than
     the #d6d6cc (1.46:1) that the :root comment above records as already
     rejected. Do not lower without re-measuring. */
  --landing-border: rgba(20, 25, 35, 0.36);
  --landing-text: #16202e;
  /* 4.77:1 on --landing-bg, 5.39:1 on white. The mockup's #8a8478 is 3.29:1,
     below AA for body text, and this token is used at body size. */
  --landing-muted: #6f6a5e;
  --landing-accent: #a3402f;
  --landing-accent-soft: #f2e5e1;
  --landing-good: #2f6b4f;
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS. CSS-only change; nothing consumes the class yet.

- [ ] **Step 3: Verify nothing changed visually**

Run: `cd frontend && git diff --stat`
Expected: only `src/index.css` modified. Because no element carries `.landing-ivory`, the rendered page must be byte-identical to before.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(landing): add scoped .landing-ivory token block"
```

---

### Task 2: Preview table — failing test, then the rebuild

The hero's preview table becomes a faithful copy of the real grid's chrome. Test first, because the citation markers and row/column structure are assertable even though the styling is not.

**Files:**
- Create: `frontend/src/components/landing/HeroSection.test.tsx`
- Modify: `frontend/src/components/landing/HeroSection.tsx:73-104` (the preview table block)

**Interfaces:**
- Consumes: `.landing-ivory` tokens from Task 1.
- Produces: `HeroSection` renders a preview table with `role="table"`, four column headers, two entity rows, and citation markers matching `/^\[S\d\]$/`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/landing/HeroSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import HeroSection from "./HeroSection";

// vite.config.ts sets globals:false, so testing-library's automatic cleanup
// never registers — without this, renders accumulate and queries find
// multiple matches.
afterEach(cleanup);

describe("HeroSection preview table", () => {
  it("renders the four diligence columns", () => {
    render(<HeroSection />);
    const table = screen.getByRole("table", { name: /diligence preview/i });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Deal",
      "Revenue quality",
      "Risk",
      "IC note",
    ]);
  });

  it("renders both fund rows", () => {
    render(<HeroSection />);
    const table = screen.getByRole("table", { name: /diligence preview/i });
    expect(within(table).getByText("Brightwater IV")).toBeTruthy();
    expect(within(table).getByText("Glenmoor III")).toBeTruthy();
  });

  it("renders citation markers in the product's bracketed form", () => {
    render(<HeroSection />);
    const table = screen.getByRole("table", { name: /diligence preview/i });
    const marks = within(table).getAllByText(/^\[S\d\]$/);
    expect(marks.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/landing/HeroSection.test.tsx`
Expected: FAIL — the current markup is a CSS-grid of `<div>`s with no `role="table"`, so `getByRole("table")` finds nothing.

- [ ] **Step 3: Replace the preview table markup**

In `HeroSection.tsx`, replace the block currently at lines 74-104 (the `rounded-[1.25rem]` wrapper containing the `grid grid-cols-[1.05fr_1.15fr_0.9fr_1.1fr]` array) with a real `<table>`:

```tsx
<div className="rounded-[1.25rem] border border-[var(--landing-border)] bg-white p-3 sm:rounded-[1.5rem] sm:p-4">
  <div className="overflow-x-auto">
    {/* Chrome mirrors components/ui/grid-table.css by copy, not import:
        11px mono-400 headers at 7px 12px 7px 9px, 38px rows at 8px 10px,
        zebra striping, and a pinned first column. Keep in sync by hand —
        see the note in grid-table.css. */}
    <table
      aria-label="Diligence preview"
      className="w-full border-collapse text-left"
    >
      <thead>
        <tr>
          {PREVIEW_COLUMNS.map((label, index) => (
            <th
              key={label}
              scope="col"
              className={`font-mono text-[11px] font-normal align-top text-[var(--landing-muted)] border-b border-[var(--landing-border)] ${
                index === 0
                  ? "border-r border-[var(--landing-border)] bg-[var(--landing-surface-alt)]"
                  : ""
              }`}
              style={{ padding: "7px 12px 7px 9px" }}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {PREVIEW_ROWS.map((row, rowIndex) => (
          <tr
            key={row.deal}
            style={{
              background:
                rowIndex % 2 === 1
                  ? "var(--landing-surface-alt)"
                  : "var(--landing-surface)",
            }}
          >
            {row.cells.map((cell, cellIndex) => (
              <td
                key={cell.text}
                className={`h-[38px] align-middle border-b border-[var(--landing-border)] text-[var(--landing-text)] ${
                  cellIndex === 0
                    ? "border-r border-[var(--landing-border)] font-medium"
                    : ""
                }`}
                style={{ padding: "8px 10px" }}
              >
                <span>{cell.text}</span>
                {cell.cite ? (
                  <span
                    className="font-mono ml-1 align-middle"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "var(--landing-accent)",
                    }}
                  >
                    [{cell.cite}]
                  </span>
                ) : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

Add these constants above the component, replacing the flat string array that fed the old grid:

```tsx
const PREVIEW_COLUMNS = ["Deal", "Revenue quality", "Risk", "IC note"];

const PREVIEW_ROWS = [
  {
    deal: "Brightwater IV",
    cells: [
      { text: "Brightwater IV" },
      { text: "Enterprise upsell supports FY26", cite: "S1" },
      { text: "Top customers concentrated", cite: "S2" },
      { text: "Advance after retention checks" },
    ],
  },
  {
    deal: "Glenmoor III",
    cells: [
      { text: "Glenmoor III" },
      { text: "Stable renewal base, slower new logos", cite: "S1" },
      { text: "Vendor savings drive margin", cite: "S3" },
      { text: "Cleaner downside, less upside" },
    ],
  },
];
```

Every string above already appears in the current file — this is a restructure, not a copy change (Global Constraint 1).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/landing/HeroSection.test.tsx`
Expected: 3 passed. (The wrapper-class assertion is added in Task 3, because Task 3 is what applies the wrapper — asserting it here would leave a red test between tasks.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/HeroSection.tsx frontend/src/components/landing/HeroSection.test.tsx
git commit -m "feat(landing): preview table mirrors the real grid chrome"
```

---

### Task 3: Apply the wrapper and the Ivory treatment

Turns the palette on for the hero and applies the serif/accent treatment.

**Files:**
- Modify: `frontend/src/components/landing/HeroSection.tsx` (outermost element, headline, eyebrow)

**Interfaces:**
- Consumes: `.landing-ivory` (Task 1), the rebuilt table (Task 2).

- [ ] **Step 1: Add the wrapper class**

On the `LandingSection` at line 16, add `landing-ivory` to the existing `className`:

```tsx
<LandingSection className="landing-ivory overflow-hidden pb-12 pt-12 sm:pb-14 sm:pt-14 lg:pb-20 lg:pt-24">
```

- [ ] **Step 2: Add the wrapper assertion and run it**

Append this test to `HeroSection.test.tsx`, inside the existing `describe` block:

```tsx
  it("scopes the Ivory palette to the hero via the wrapper class", () => {
    const { container } = render(<HeroSection />);
    expect(container.querySelector(".landing-ivory")).not.toBeNull();
  });
```

Run: `cd frontend && npx vitest run src/components/landing/HeroSection.test.tsx`
Expected: 4 passed. If you run this before Step 1's edit, the new test fails — that is the intended red-then-green order.

- [ ] **Step 3: Apply the headline treatment**

Replace the `LandingHeading` block at lines 20-22. Copy is unchanged; the second clause takes the accent, matching the mockup's two-tone hero:

```tsx
<LandingHeading as="h1" size="hero" className="mt-6 max-w-4xl font-serif">
  Pilot an AI diligence workspace{" "}
  <span style={{ color: "var(--landing-accent)" }}>on one deal room.</span>
</LandingHeading>
```

**Do not add `tracking-*` or `leading-*` here, and do not pass a `style` prop.** Two hard constraints, both verified against the source:

1. `LandingHeading` accepts only `children`, `as`, `size`, `className` (`ui/LandingHeading.tsx:5-10`). There is no `style` prop — passing one is a TypeScript error.
2. `SIZE_CLASSES.hero` already sets `leading-[0.96] tracking-[-0.035em] sm:tracking-[-0.05em] lg:leading-[0.92]`, and this project has **no `tailwind-merge`**. Competing utilities in one class string resolve by stylesheet order, not string order — so appending the mockup's `tracking-[-0.02em]`/`leading-[1.04]` would win or lose unpredictably. The existing hero scale is a deliberate, tuned value; `font-serif` is the only family change needed, and it does not collide because `SIZE_CLASSES` sets no font-family.

`font-serif` maps to `var(--serif)` = Playfair Display via `tailwind.config.js:52`.

- [ ] **Step 4: Apply the eyebrow pill treatment**

Replace `<LandingEyebrow>Pilot Program</LandingEyebrow>` at line 19:

```tsx
<span className="inline-flex items-center gap-[7px] rounded-full border border-[var(--landing-border)] bg-[var(--landing-accent-soft)] px-[13px] py-[5px] text-[11.5px] font-semibold text-[var(--landing-accent)]">
  <span
    className="inline-block h-[6px] w-[6px] rounded-full"
    style={{ background: "var(--landing-accent)" }}
  />
  Pilot Program
</span>
```

- [ ] **Step 5: Typecheck, build, and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npm run build && npx vitest run`
Expected: typecheck clean, build succeeds, all tests pass (the pre-existing suite plus the 4 new ones).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/landing/HeroSection.tsx
git commit -m "feat(landing): apply Ivory palette and treatment to the hero"
```

---

### Task 4: Visual verification and the cross-reference note

The regression that matters is not in the hero — it is whether anything below the hero moved. That is the entire claim of the scoped-wrapper approach.

**Files:**
- Modify: `frontend/src/components/ui/grid-table.css` (comment only, at the top block)

- [ ] **Step 1: Capture the hero at both widths**

Use the `frontend:verify` skill to launch the app and screenshot the landing page at a desktop width (1440px) and a mobile width (390px).

Confirm by eye: ivory background, ink-navy headline with the second clause in oxblood, the accent pill, and a preview table with mono headers, zebra rows, a pinned first column and `[S1]` markers.

- [ ] **Step 2: Confirm the sections below the hero are unchanged**

In the same screenshots, scroll past the hero. The nav, feature cards, how-it-works, pricing and footer must look exactly as they did before this branch.

If any of them shifted, the wrapper is leaking — `.landing-ivory` is on an element that wraps more than the hero. Fix by moving the class down to the hero's own outermost element before proceeding.

- [ ] **Step 3: Add the cross-reference comment**

At the end of the header comment block in `frontend/src/components/ui/grid-table.css`, add:

```
   A static copy of this chrome (11px mono-400 headers, 38px rows, zebra,
   pinned first column) also lives in components/landing/HeroSection.tsx as
   the marketing preview table. It is deliberately NOT importing this file —
   see D5 in docs/superpowers/specs/2026-08-01-landing-ivory-hero-design.md.
   If you change the geometry here, that copy will drift.
```

- [ ] **Step 4: Final verification**

Run: `cd frontend && npx tsc --noEmit && npm run build && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/grid-table.css
git commit -m "docs(grid): note the landing page's static copy of this chrome"
```

---

## Self-Review Notes

**Spec coverage.** Token block → Task 1. Hero restyle (headline, eyebrow, borders) → Task 3. Preview table fidelity → Task 2. Citation markers in real form (D6) → Task 2 Step 3 and its test. D7 border value → Task 1 Step 1, with the reasoning in the CSS comment so it survives without the spec. D5 drift mitigation → Task 4 Step 3. Verification section → Task 4 Steps 1-2.

**Copy freeze verified.** Every string in Task 2's `PREVIEW_ROWS`/`PREVIEW_COLUMNS` and Task 3's headline and eyebrow appears verbatim in the current `HeroSection.tsx`. The only structural change to text is splitting the headline across two spans to color the second clause.

**Two assumptions checked against source, not guessed.** `LandingHeading` accepts only `children`/`as`/`size`/`className` (`ui/LandingHeading.tsx:5-10`) — an earlier draft of this plan passed it a `style` prop, which would not have compiled. And `SIZE_CLASSES.hero` already pins `leading`/`tracking`, which with no `tailwind-merge` in the project makes appended overrides resolve by stylesheet order; Task 3 Step 3 therefore changes family only. `font-mono` and `font-serif` map to `var(--mono)`/`var(--serif)` via `tailwind.config.js:50-54`.

**Not covered by automated tests.** Palette values, border contrast, and zebra striping are CSS — no test asserts them. Task 4's screenshots are the only check, which is why Step 2 names the specific failure mode (wrapper leaking) rather than saying "verify it looks right".

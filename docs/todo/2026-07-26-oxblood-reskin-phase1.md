# Oxblood Reskin — Phase 1 (Colour) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the oxblood/ivory colour reskin so an automated computed-style scan reports zero off-palette colours on every app route in both themes.

**Architecture:** All colour flows through CSS custom properties in `frontend/src/index.css`, consumed either as Tailwind aliases (`bg-surface`, `text-t1`) or as `var()` strings. This phase adds a curated 8-colour badge palette, corrects two accessibility regressions, and removes every remaining hardcoded hex from the app surfaces. No component API changes except `stageBadge()`, whose three call sites are updated in the same task.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind (class-based dark mode), Vitest, Playwright-core driving installed headless Edge.

**Spec:** `docs/superpowers/specs/2026-07-26-oxblood-reskin-design.md`
**Branch:** `feat/reskin-oxblood` (base layer already committed as `03e6a9d`)

## Global Constraints

- **Do not touch typography.** No `fontSize`, `fontFamily`, `lineHeight`, or font loading changes. That is Phase 2.
- **Do not touch radii.** No `borderRadius` changes.
- **Do not touch the landing page.** `frontend/src/components/landing/**` and the `--landing-*` tokens stay as they are. CLAUDE.md records the landing copy as intentional pending work.
- **Text contrast floor is 4.5:1.** Any new or changed text colour must clear it against every surface it renders on.
- **Border contrast target is 2.2:1**, matching the pre-reskin `#b0b0a3`. Not 3:1 — see spec D2.
- **Schema migrations are additive-only** and out of scope here; this phase touches no backend.
- After every task: `npx tsc --noEmit` and `npx vitest run` must pass. ESLint warnings must not exceed the current baseline.
- Run all commands from `frontend/`.
- Commit after every task. Never push.

---

### Task 1: Badge palette tokens and accessor

Creates the single source for badge colour. Everything in Tasks 4 and 5 consumes it.

**Files:**
- Create: `frontend/src/lib/badgePalette.ts`
- Create: `frontend/src/lib/badgePalette.test.ts`
- Modify: `frontend/src/index.css` (token blocks + `.badge-tone-*` classes)

**Interfaces:**
- Produces:
  - `type BadgeTone = "oxblood" | "clay" | "ochre" | "moss" | "sage" | "teal" | "slate" | "plum"`
  - `type ReservedTone = "ink"`
  - `const BADGE_TONES: readonly BadgeTone[]` — the 8 admin-selectable tones, in palette order
  - `toneVars(tone: BadgeTone | ReservedTone): { bg: string; fg: string; edge: string }` — returns `var(--b-*)` strings for inline styles
  - `toneClass(tone: BadgeTone | ReservedTone): string` — returns `"badge-tone-<name>"` for className consumers

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/badgePalette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BADGE_TONES, toneVars, toneClass } from "./badgePalette";

describe("badge palette", () => {
  it("exposes exactly the 8 selectable tones in palette order", () => {
    expect(BADGE_TONES).toEqual([
      "oxblood", "clay", "ochre", "moss", "sage", "teal", "slate", "plum",
    ]);
  });

  it("resolves a tone to its three CSS vars", () => {
    expect(toneVars("sage")).toEqual({
      bg: "var(--b-sage-bg)",
      fg: "var(--b-sage-fg)",
      edge: "var(--b-sage-ed)",
    });
  });

  it("supports the reserved ink tone for terminal states", () => {
    expect(toneVars("ink")).toEqual({
      bg: "var(--b-ink-bg)",
      fg: "var(--b-ink-fg)",
      edge: "var(--b-ink-ed)",
    });
  });

  it("does not offer ink as a selectable tone", () => {
    expect(BADGE_TONES).not.toContain("ink");
  });

  it("maps a tone to its utility class", () => {
    expect(toneClass("plum")).toBe("badge-tone-plum");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/badgePalette.test.ts`
Expected: FAIL — "Failed to resolve import ./badgePalette"

- [ ] **Step 3: Write the module**

Create `frontend/src/lib/badgePalette.ts`:

```ts
/**
 * Curated badge palette (spec D1). Eight admin-selectable tones plus a
 * reserved `ink` used for terminal states.
 *
 * Colour lives in CSS vars (index.css), never here — that is what keeps the
 * palette theme-aware by construction and keeps the off-palette scanner's
 * whitelist finite. Every value was derived and contrast-verified: worst
 * label contrast 7.01:1, worst border 2.2:1, across both themes.
 *
 * Note: moss, sage and teal share luminance and separate by hue alone. That
 * is acceptable only because a badge always carries a text label, making
 * colour a redundant channel. Do not use these tones as a sole signal.
 */
export type BadgeTone =
  | "oxblood"
  | "clay"
  | "ochre"
  | "moss"
  | "sage"
  | "teal"
  | "slate"
  | "plum";

/** Not admin-selectable — reserved for terminal stages (Closed, Committed). */
export type ReservedTone = "ink";

export const BADGE_TONES: readonly BadgeTone[] = [
  "oxblood",
  "clay",
  "ochre",
  "moss",
  "sage",
  "teal",
  "slate",
  "plum",
] as const;

export interface ToneVars {
  bg: string;
  fg: string;
  edge: string;
}

/** CSS var triple for inline `style={{}}` consumers. */
export function toneVars(tone: BadgeTone | ReservedTone): ToneVars {
  return {
    bg: `var(--b-${tone}-bg)`,
    fg: `var(--b-${tone}-fg)`,
    edge: `var(--b-${tone}-ed)`,
  };
}

/** Utility class for `className` consumers (see .badge-tone-* in index.css). */
export function toneClass(tone: BadgeTone | ReservedTone): string {
  return `badge-tone-${tone}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/badgePalette.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the light-theme tokens to index.css**

In `frontend/src/index.css`, inside the `:root { … }` block, immediately **before** the `/* Semantic surface/text/border tokens` comment, insert:

```css
  /* ── Badge palette (spec D1) ────────────────────────────────────────────
     Eight admin-selectable tones plus reserved `ink` for terminal stages.
     Derived and verified: worst label contrast 7.01:1, worst border 2.2:1.
     Consumed via lib/badgePalette.ts — never reference these directly. */
  --b-oxblood-bg: #f8efed; --b-oxblood-fg: #8d3020; --b-oxblood-ed: #db9f95;
  --b-clay-bg:    #f8f2ed; --b-clay-fg:    #6f4725; --b-clay-ed:    #c9a98d;
  --b-ochre-bg:   #f7f5ed; --b-ochre-fg:   #5e4f21; --b-ochre-ed:   #bdac7a;
  --b-moss-bg:    #f2f6ee; --b-moss-fg:    #3e5b29; --b-moss-ed:    #9ab587;
  --b-sage-bg:    #eff6f2; --b-sage-fg:    #2d5c45; --b-sage-ed:    #91b6a3;
  --b-teal-bg:    #eef5f6; --b-teal-fg:    #2c5963; --b-teal-ed:    #90b4bb;
  --b-slate-bg:   #eef2f6; --b-slate-fg:   #365278; --b-slate-ed:   #a0b0c5;
  --b-plum-bg:    #f6eef4; --b-plum-fg:    #783662; --b-plum-ed:    #c7a3bb;
  /* Reserved: terminal stages invert so "done" reads at a glance. */
  --b-ink-bg: var(--text-1); --b-ink-fg: var(--bg); --b-ink-ed: var(--text-1);
```

- [ ] **Step 6: Add the dark-theme tokens to index.css**

In the `.dark { … }` block, immediately **before** the `/* Dark overrides for the semantic tokens. */` comment, insert:

```css
  /* Badge palette (dark). Same roles, lifted for the ink-green ground. */
  --b-oxblood-bg: #401d17; --b-oxblood-fg: #e5a59a; --b-oxblood-ed: #894134;
  --b-clay-bg:    #302318; --b-clay-fg:    #d2a884; --b-clay-ed:    #6c5037;
  --b-ochre-bg:   #2c2617; --b-ochre-fg:   #c9b373; --b-ochre-ed:   #605534;
  --b-moss-bg:    #20281a; --b-moss-fg:    #99bf7d; --b-moss-ed:    #4a5c3d;
  --b-sage-bg:    #1d2a24; --b-sage-fg:    #88bfa3; --b-sage-ed:    #425c4f;
  --b-teal-bg:    #1c292c; --b-teal-fg:    #87bac4; --b-teal-ed:    #3f5a5f;
  --b-slate-bg:   #202832; --b-slate-fg:   #9fb4d0; --b-slate-ed:   #47576b;
  --b-plum-bg:    #32202c; --b-plum-fg:    #d2a3c2; --b-plum-ed:    #714b65;
```

`--b-ink-*` is not repeated here: it already resolves through `--text-1` / `--bg`, which the `.dark` block overrides.

- [ ] **Step 7: Add the utility classes to index.css**

At the end of `frontend/src/index.css`, immediately **after** the `.dd-zebra tbody tr:nth-child(even) td { … }` rule, insert:

```css
/* Badge tone utilities — className counterpart to lib/badgePalette.ts.
   Kept beside .dd-zebra because both are shared table/chip utilities that
   predate any Badge primitive. */
.badge-tone-oxblood { background: var(--b-oxblood-bg); color: var(--b-oxblood-fg); border-color: var(--b-oxblood-ed); }
.badge-tone-clay    { background: var(--b-clay-bg);    color: var(--b-clay-fg);    border-color: var(--b-clay-ed); }
.badge-tone-ochre   { background: var(--b-ochre-bg);   color: var(--b-ochre-fg);   border-color: var(--b-ochre-ed); }
.badge-tone-moss    { background: var(--b-moss-bg);    color: var(--b-moss-fg);    border-color: var(--b-moss-ed); }
.badge-tone-sage    { background: var(--b-sage-bg);    color: var(--b-sage-fg);    border-color: var(--b-sage-ed); }
.badge-tone-teal    { background: var(--b-teal-bg);    color: var(--b-teal-fg);    border-color: var(--b-teal-ed); }
.badge-tone-slate   { background: var(--b-slate-bg);   color: var(--b-slate-fg);   border-color: var(--b-slate-ed); }
.badge-tone-plum    { background: var(--b-plum-bg);    color: var(--b-plum-fg);    border-color: var(--b-plum-ed); }
.badge-tone-ink     { background: var(--b-ink-bg);     color: var(--b-ink-fg);     border-color: var(--b-ink-ed); }
```

- [ ] **Step 8: Verify the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass (193 = 188 + 5), no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/badgePalette.ts src/lib/badgePalette.test.ts src/index.css
git commit -m "feat(frontend): curated badge palette tokens and accessor"
```

---

### Task 2: Correct the base colour tokens

Fixes the two accessibility regressions the artifact would introduce (spec D2) and makes `--violet` a deliberate decision rather than a forced one (spec D3). The test is a contract test against `index.css` itself — it exists because the exact failure mode here is a value silently drifting, which no component test would catch.

**Files:**
- Modify: `frontend/src/index.css:88-92` (light `--border`, `--border-light`, `--text-3`)
- Modify: `frontend/src/index.css:153-154` (dark `--border`, `--border-light`)
- Modify: `frontend/src/index.css:54-66` (the `--violet` comment block)
- Create: `frontend/src/index.tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no exported symbols. Downstream tasks rely on `--text-3`, `--border`, `--border-light` having the corrected values.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/index.tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// package.json sets "type": "module", so __dirname does not exist here.
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "index.css"), "utf8");

/** Grab a token's value from the :root block (first match) or .dark block. */
function tokenValue(name: string, scope: "light" | "dark"): string {
  const start = scope === "light" ? css.indexOf(":root {") : css.indexOf(".dark {");
  const block = css.slice(start, css.indexOf("\n}", start));
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(block);
  if (!m) throw new Error(`token ${name} not found in ${scope} block`);
  return m[1].trim();
}

describe("colour token contract", () => {
  it("keeps --text-3 above the 4.5:1 floor on sand (spec D2)", () => {
    // #8a8478 is the artifact value and measures 3.29:1 on #f4f1ea.
    expect(tokenValue("--text-3", "light")).toBe("#6f6a5e");
  });

  it("restores the legacy border weight, not the artifact's hairline", () => {
    // Legacy #b0b0a3 was 2.19:1. alpha .10 = 1.22:1, .16 = 1.40:1 — both regress it.
    expect(tokenValue("--border", "light")).toBe("rgba(20, 25, 35, 0.34)");
    expect(tokenValue("--border", "dark")).toBe("rgba(255, 255, 255, 0.24)");
  });

  it("keeps --border-light as the deliberate decorative hairline", () => {
    expect(tokenValue("--border-light", "light")).toBe("rgba(20, 25, 35, 0.1)");
    expect(tokenValue("--border-light", "dark")).toBe("rgba(255, 255, 255, 0.08)");
  });

  it("resolves --violet to ink in both themes (spec D3)", () => {
    expect(tokenValue("--violet", "light")).toBe("#2b3646");
    expect(tokenValue("--violet", "dark")).toBe("#c5d0ca");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/index.tokens.test.ts`
Expected: FAIL — `--text-3` is `#8a8478`, `--border` is `rgba(20, 25, 35, 0.16)`.

- [ ] **Step 3: Apply the light-theme corrections**

In `frontend/src/index.css`, replace lines 88–92:

```css
  --border: rgba(20, 25, 35, 0.16);
  --border-light: rgba(20, 25, 35, 0.1);
  --text-1: #16202e;
  --text-2: #2b3646;
  --text-3: #8a8478;
```

with:

```css
  /* --border carries the accessible weight and is the default for ~160 sites;
     --border-light is the artifact's 10% hairline, a deliberate opt-in used by
     6 decorative popover rules. Target is 2.2:1 (the legacy #b0b0a3), not the
     3:1 of SC 1.4.11 — the repo's own value never met 3:1 and grid lines that
     heavy read as rules in a dense table. See spec D2. */
  --border: rgba(20, 25, 35, 0.34);
  --border-light: rgba(20, 25, 35, 0.1);
  --text-1: #16202e;
  --text-2: #2b3646;
  /* Artifact value #8a8478 is 3.29:1 on sand — below the AA floor, and sand is
     both the app background and the neutral chip fill. Darkened to clear 4.5:1
     on white (5.39), surface-alt (5.07) and sand (4.77) while staying muted. */
  --text-3: #6f6a5e;
```

- [ ] **Step 4: Apply the dark-theme corrections**

Replace lines 153–154:

```css
  --border: rgba(255, 255, 255, 0.14);
  --border-light: rgba(255, 255, 255, 0.08);
```

with:

```css
  --border: rgba(255, 255, 255, 0.24);
  --border-light: rgba(255, 255, 255, 0.08);
```

Leave dark `--text-3: #7f938a` unchanged — it already measures 5.0:1 on `--surface`.

- [ ] **Step 5: Rewrite the --violet comment block**

Replace the comment block at lines 54–62 (both the original cobalt-era comment and the `SPIKE — FORCED DECISION` block) with:

```css
  /* Violet — the second semantic hue (tabular workflows, derived vs extracted
     citations, KV cells). Resolves to secondary ink: the artifact defines no
     second hue, and ink measured a better separation from oxblood than any
     plum that also passed surface contrast — 1.94:1 vs 1.54:1 normal, and
     2.51:1 vs 1.73:1 under simulated deuteranopia. Deliberate, not forced.
     See spec D3. */
```

Do the same for the `.dark` block's violet comment at line 141, replacing it with:

```css
  /* Violet resolves to secondary ink here too — see spec D3. */
```

- [ ] **Step 6: Settle the derived dark-theme token comments (spec §5)**

The `.dark` block already carries all ~19 tokens the artifact never specified —
the spike wrote them. What is wrong is the framing: they are commented as a
provisional finding rather than as implemented values. Replace the comment
block at the top of `.dark` (lines 116–125, the `═══ SPIKE:` block) with:

```css
  /* Dark theme. The artifact specifies only 6 dark values (--ivory/--paper/
     --ink/--oxblood/--sand/--line); this app needs ~25. Four more are
     harvested from its dark demo markup — --text-2 #c5d0ca, --text-3 #7f938a,
     the accent tint, and --on-accent #0e1a17 — which beats inventing them.
     The remainder (text-4, zebra, grid-header, status scale, tints, scrim,
     shadows) are DERIVED: each from its light-mode role at matched contrast
     against the #0e1a17 ground, then contrast-checked. Derived, not specified
     — revisable without archaeology. See spec §5. */
```

Do not change any dark token *value* in this step. Only the comment.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/index.tokens.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 8: Verify the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/index.css src/index.tokens.test.ts
git commit -m "fix(frontend): restore text and border contrast, settle --violet"
```

---

### Task 3: Retokenize the workflow theme colours

`AMBER` and `GREEN` are raw hex in an otherwise tokenized module. They are among the workspace's stray off-palette hits.

**Files:**
- Modify: `frontend/src/components/workflows/theme.ts:13-14`
- Modify: `frontend/src/components/workflows/theme.test.ts`

**Interfaces:**
- Consumes: `--status-warning` and `--status-good` from `index.css` (already defined).
- Produces: `AMBER` and `GREEN` change from hex literals to `var()` strings. Signature unchanged — both remain `string`, and `tint()` already accepts `var()` strings (proven by the existing `ACCENT` test), so all 9 consuming files keep working untouched.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/workflows/theme.test.ts`:

```ts
import { AMBER, GREEN, RED } from "./theme";

describe("semantic colour exports", () => {
  it("routes every semantic colour through a token, not a hex literal", () => {
    for (const [name, value] of Object.entries({ AMBER, GREEN, RED })) {
      expect(value, `${name} must be a CSS var`).toMatch(/^var\(--[a-z-]+\)$/);
    }
  });

  it("maps amber and green onto the shared status scale", () => {
    expect(AMBER).toBe("var(--status-warning)");
    expect(GREEN).toBe("var(--status-good)");
  });

  it("still composes with tint()", () => {
    expect(tint(GREEN, 15)).toBe("color-mix(in srgb, var(--status-good) 15%, transparent)");
  });
});
```

Note: `tint` and `describe`/`expect`/`it` are already imported at the top of this file — extend the existing import of `./theme` rather than adding a duplicate import statement.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/workflows/theme.test.ts`
Expected: FAIL — `AMBER` is `"#f59e0b"`, not a `var()` string.

- [ ] **Step 3: Retokenize**

In `frontend/src/components/workflows/theme.ts`, replace lines 13–14:

```ts
export const AMBER = "#f59e0b";
export const GREEN = "#22c55e";
```

with:

```ts
// Amber and green fold onto the shared status scale so workflow severity uses
// the same three colours as findings, coverage and confidence. Both were raw
// hex before the reskin and were among the workspace's off-palette hits.
export const AMBER = "var(--status-warning)";
export const GREEN = "var(--status-good)";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/workflows/theme.test.ts`
Expected: PASS

- [ ] **Step 5: Verify the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/workflows/theme.ts src/components/workflows/theme.test.ts
git commit -m "refactor(frontend): retokenize workflow amber and green onto status scale"
```

---

### Task 4: Make stage badges palette-driven

Replaces 54 hand-tuned constants with a stage→tone map. The `isDark` parameter disappears because CSS vars are already theme-aware — all three call sites are updated here.

**Files:**
- Modify: `frontend/src/lib/stageBadges.ts` (full rewrite)
- Create: `frontend/src/lib/stageBadges.test.ts`
- Modify: `frontend/src/components/dd/TopBar.tsx`
- Modify: `frontend/src/components/home/DealListItem.tsx`
- Modify: `frontend/src/pages/ManagerPage.tsx`

**Interfaces:**
- Consumes: `BadgeTone`, `ReservedTone`, `toneVars`, `ToneVars` from `@/lib/badgePalette` (Task 1).
- Produces:
  - `STAGE_TONES: Record<string, BadgeTone | ReservedTone>` — the default stage→tone assignment
  - `stageBadge(stage: string): BadgeStyle | null` — **signature changed**, no longer takes `isDark`
  - `interface BadgeStyle { bg: string; fg: string; border: string }` — unchanged shape, values are now `var()` strings

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/stageBadges.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stageBadge, STAGE_TONES } from "./stageBadges";
import { BADGE_TONES } from "./badgePalette";

describe("stageBadge", () => {
  it("returns CSS vars, not hex, so the chip is theme-aware", () => {
    const badge = stageBadge("Screening");
    expect(badge).toEqual({
      bg: "var(--b-sage-bg)",
      fg: "var(--b-sage-fg)",
      border: "var(--b-sage-ed)",
    });
  });

  it("inverts terminal stages to ink", () => {
    for (const terminal of ["Closed", "Committed"]) {
      expect(stageBadge(terminal)).toEqual({
        bg: "var(--b-ink-bg)",
        fg: "var(--b-ink-fg)",
        border: "var(--b-ink-ed)",
      });
    }
  });

  it("gives the deal and fund tracks matching tones for equivalent stages", () => {
    expect(stageBadge("Due Diligence")).toEqual(stageBadge("Diligence"));
    expect(stageBadge("IC Review")).toEqual(stageBadge("IC"));
  });

  it("returns null for an unknown stage so callers can fall back", () => {
    expect(stageBadge("Not A Stage")).toBeNull();
  });

  it("only assigns tones that exist in the palette", () => {
    const legal = new Set<string>([...BADGE_TONES, "ink"]);
    for (const [stage, tone] of Object.entries(STAGE_TONES)) {
      expect(legal.has(tone), `${stage} uses unknown tone ${tone}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stageBadges.test.ts`
Expected: FAIL — `STAGE_TONES` is not exported and `stageBadge` still requires two arguments.

- [ ] **Step 3: Rewrite stageBadges.ts**

Replace the entire contents of `frontend/src/lib/stageBadges.ts` with:

```ts
/**
 * Deal/fund stage badge styling, shared by the home deal list, the deal
 * workspace top bar and the manager page so a stage reads the same everywhere.
 *
 * Colour comes from the curated badge palette (lib/badgePalette.ts), which is
 * theme-aware via CSS vars — hence no `isDark` parameter. Contrast is verified
 * once at the palette level: worst label 7.01:1, worst border 2.2:1.
 *
 * Defaults below preserve the pre-reskin hue assignments where a palette tone
 * is close, so nothing shifts unrecognisably. When admin-configurable badge
 * colour ships, this map becomes the fallback for stages with no stored tone.
 */
import type { BadgeTone, ReservedTone } from "./badgePalette";
import { toneVars } from "./badgePalette";

export interface BadgeStyle {
  bg: string;
  fg: string;
  border: string;
}

export const STAGE_TONES: Record<string, BadgeTone | ReservedTone> = {
  // Deal track
  Screening: "sage",
  "Due Diligence": "slate",
  "IC Review": "plum",
  Closed: "ink",
  // Fund lifecycle
  Diligence: "slate",
  IC: "plum",
  Committed: "ink",
  Monitoring: "moss",
  "Re-up review": "ochre",
};

/** Badge style for a stage, or null if unrecognized (caller supplies a neutral fallback). */
export function stageBadge(stage: string): BadgeStyle | null {
  const tone = STAGE_TONES[stage];
  if (!tone) return null;
  const v = toneVars(tone);
  return { bg: v.bg, fg: v.fg, border: v.edge };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stageBadges.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Update the three call sites**

Run `grep -rn "stageBadge(" src/` to locate them, then in each of `src/components/dd/TopBar.tsx`, `src/components/home/DealListItem.tsx`, and `src/pages/ManagerPage.tsx`, change the call from two arguments to one:

```ts
// before
const badge = stageBadge(stage, isDark);
// after
const badge = stageBadge(stage);
```

If removing the argument leaves an `isDark` variable unused in a file, delete only that variable's declaration — do not remove `isDark` where other code in the same file still uses it.

- [ ] **Step 6: Verify typecheck catches nothing outstanding**

Run: `npx tsc --noEmit`
Expected: no errors. A remaining "Expected 1 arguments, but got 2" means a call site was missed.

- [ ] **Step 7: Verify the full suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stageBadges.ts src/lib/stageBadges.test.ts \
        src/components/dd/TopBar.tsx src/components/home/DealListItem.tsx \
        src/pages/ManagerPage.tsx
git commit -m "refactor(frontend): drive stage badges from the curated palette"
```

---

### Task 5: Move matrix chips onto palette classes

`matrixColumnConfig.ts` holds three separate Tailwind-utility palettes. The hues stay — they move from Tailwind's default scale onto the system's.

**Files:**
- Modify: `frontend/src/lib/matrixColumnConfig.ts:54-71` (`TAG_COLORS`, `CURRENCY_COLORS`) and the column-type colour strings around line 55–59
- Create: `frontend/src/lib/matrixColumnConfig.test.ts`

**Interfaces:**
- Consumes: `toneClass`, `BADGE_TONES` from `@/lib/badgePalette` (Task 1).
- Produces: `TAG_COLORS` and `CURRENCY_COLORS` keep their names and `string` / `Record<string, string>` types, so the 9 consuming files need no change. Values change from Tailwind utility strings to single `badge-tone-*` class names.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/matrixColumnConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TAG_COLORS, CURRENCY_COLORS } from "./matrixColumnConfig";
import { BADGE_TONES } from "./badgePalette";

const LEGAL = new Set(BADGE_TONES.map((t) => `badge-tone-${t}`));

describe("matrix chip colours", () => {
  it("uses palette classes, never raw Tailwind colour utilities", () => {
    for (const cls of [...TAG_COLORS, ...Object.values(CURRENCY_COLORS)]) {
      expect(cls, `"${cls}" is not a palette class`).toMatch(/^badge-tone-[a-z]+$/);
      expect(LEGAL.has(cls), `"${cls}" is not a known tone`).toBe(true);
    }
  });

  it("keeps tag colours distinct so adjacent tags stay separable", () => {
    expect(new Set(TAG_COLORS).size).toBe(TAG_COLORS.length);
  });

  it("still covers every currency it covered before", () => {
    for (const code of ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CNY"]) {
      expect(CURRENCY_COLORS[code]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matrixColumnConfig.test.ts`
Expected: FAIL — values are `"bg-blue-100 text-blue-700 dark:…"`, and `CURRENCY_COLORS` is not exported.

- [ ] **Step 3: Replace the palettes**

In `frontend/src/lib/matrixColumnConfig.ts`, replace `TAG_COLORS` (lines 54–61) with:

```ts
// Tag chips cycle through six palette tones. Distinct tones matter more than
// specific hues here — the index is stable per tag, not semantic.
export const TAG_COLORS = [
  "badge-tone-slate",
  "badge-tone-plum",
  "badge-tone-sage",
  "badge-tone-ochre",
  "badge-tone-oxblood",
  "badge-tone-teal",
];
```

and replace `CURRENCY_COLORS` (lines 63–71) with:

```ts
// Currency chips keep hue-coding, sourced from the palette rather than from
// Tailwind's default scale. Exported so the colour contract can be tested.
export const CURRENCY_COLORS: Record<string, string> = {
  USD: "badge-tone-moss",
  EUR: "badge-tone-slate",
  GBP: "badge-tone-plum",
  JPY: "badge-tone-oxblood",
  CAD: "badge-tone-teal",
  AUD: "badge-tone-sage",
  CNY: "badge-tone-ochre",
};
```

- [ ] **Step 4: Replace the column-type and yes/no colour strings**

Search the file for remaining raw Tailwind colour utilities:

```bash
grep -n "bg-\(blue\|green\|amber\|rose\|purple\|teal\|cyan\|violet\|emerald\|red\)-[0-9]" src/lib/matrixColumnConfig.ts
```

Replace each with the palette-class equivalent using this mapping — blue→`badge-tone-slate`, green/emerald→`badge-tone-moss`, amber→`badge-tone-ochre`, rose/red→`badge-tone-oxblood`, purple/violet→`badge-tone-plum`, teal/cyan→`badge-tone-teal`. Each replacement collapses a light+dark utility pair into one class, so delete the `dark:` half rather than translating it.

- [ ] **Step 5: Confirm no raw colour utilities remain**

Run: `grep -n "bg-\(blue\|green\|amber\|rose\|purple\|teal\|cyan\|violet\|emerald\|red\)-[0-9]" src/lib/matrixColumnConfig.ts`
Expected: no output.

- [ ] **Step 6: Ensure chips render their border**

The `.badge-tone-*` classes set `border-color` but not `border-width`. Run:

```bash
grep -rn "CURRENCY_COLORS\|TAG_COLORS\|COLUMN_TYPE" src/components/ | grep -i "class"
```

For each consuming element, confirm it already carries a `border` utility. Where one renders with no border at all, add `border` to its className so the palette's edge colour is visible; do not add borders to chips that were deliberately borderless before — check the pre-change rendering if unsure.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/lib/matrixColumnConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Verify the full suite, typecheck and build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all pass. The build matters here — Tailwind must still emit the classes these files reference.

- [ ] **Step 9: Commit**

```bash
git add src/lib/matrixColumnConfig.ts src/lib/matrixColumnConfig.test.ts src/components/
git commit -m "refactor(frontend): move matrix chips onto the badge palette"
```

---

### Task 6: Remove the hardcoded neutral palettes

Five files each declare a local `isDark ? … : …` palette. These are why the deal list did not reskin — `HomePage` alone holds the old `#0f0f0f` canvas — and why `--landing-*` tokens leak into app surfaces.

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx:167-171`
- Modify: `frontend/src/components/home/HomeSidebar.tsx:80-83`
- Modify: `frontend/src/components/home/DealListItem.tsx:76-79`
- Modify: `frontend/src/components/dd/CitationPanel.tsx:14-17` and `:181-182`
- Modify: `frontend/src/components/DocumentViewer.tsx:24-27` and `:193-194`

**Interfaces:**
- Consumes: the semantic tokens corrected in Task 2.
- Produces: nothing exported. These are local variable substitutions.

- [ ] **Step 1: Replace the palette block in HomePage.tsx**

Replace lines 167–171:

```tsx
  const pageBg = isDark ? "#0f0f0f" : "var(--landing-bg)";
  const border = isDark ? "#262626" : "var(--landing-border)";
  const surface = isDark ? "#151515" : "#ffffff";
  const surfaceAlt = isDark ? "#111111" : "#f8f8f4";
  const text = isDark ? "#f5f5f5" : "var(--landing-text)";
```

with:

```tsx
  // Semantic tokens flip with the theme themselves — no isDark branching, and
  // no --landing-* on an app surface (those belong to the marketing page).
  const pageBg = "var(--bg)";
  const border = "var(--border)";
  const surface = "var(--surface)";
  const surfaceAlt = "var(--surface-alt)";
  const text = "var(--text-1)";
```

- [ ] **Step 2: Replace the palette block in HomeSidebar.tsx**

Replace lines 80–83 with:

```tsx
  const surface = "var(--surface-alt)";
  const surfaceAlt = "var(--surface)";
  const border = "var(--border)";
  const text = "var(--text-1)";
```

Note the deliberate swap: this file's light-mode `surface` was `#f8f8f4` (the recessed tone) and `surfaceAlt` was `#ffffff`, the opposite of the other four files. Preserve that inversion rather than normalising it.

- [ ] **Step 3: Replace the palette block in DealListItem.tsx**

Replace lines 76–79 with:

```tsx
  const surface = "var(--surface)";
  const surfaceAlt = "var(--surface-alt)";
  const border = "var(--border)";
  const text = "var(--text-1)";
```

- [ ] **Step 4: Replace the palette block in CitationPanel.tsx**

Replace lines 14–17 with:

```tsx
  const surface = "var(--surface)";
  const surfaceAlt = "var(--surface-alt)";
  const border = "var(--border)";
  const text = "var(--text-1)";
```

Then replace the inverted chip at lines 181–182:

```tsx
            background: isDark ? "#f5f5f5" : "#111111",
            color: isDark ? "#111111" : "#ffffff",
```

with:

```tsx
            background: "var(--text-1)",
            color: "var(--bg)",
```

- [ ] **Step 5: Replace the palette block in DocumentViewer.tsx**

Replace lines 24–27 with:

```tsx
  const surface = "var(--surface)";
  const surfaceAlt = "var(--surface-alt)";
  const border = "var(--border)";
  const text = "var(--text-1)";
```

Then replace the inverted chip at lines 193–194 with:

```tsx
                  background: "var(--text-1)",
                  color: "var(--bg)",
```

- [ ] **Step 6: Remove now-unused isDark bindings**

Run: `npx tsc --noEmit` and `npx eslint src/ --max-warnings 999`

In each of the five files, if `isDark` (or the `useTheme()` call feeding it) is now unused, remove that binding. If other code in the file still reads `isDark`, leave it. Do not remove a `useTheme()` call that is still used for anything else.

- [ ] **Step 7: Confirm no hardcoded neutrals remain in these files**

Run:

```bash
grep -n "#0f0f0f\|#151515\|#262626\|#101010\|#111111\|#f5f5f5\|#f8f8f4\|landing-" \
  src/pages/HomePage.tsx src/components/home/HomeSidebar.tsx \
  src/components/home/DealListItem.tsx src/components/dd/CitationPanel.tsx \
  src/components/DocumentViewer.tsx
```

Expected: no output.

- [ ] **Step 8: Verify the full suite, typecheck and build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/pages/HomePage.tsx src/components/home/HomeSidebar.tsx \
        src/components/home/DealListItem.tsx src/components/dd/CitationPanel.tsx \
        src/components/DocumentViewer.tsx
git commit -m "fix(frontend): route app surfaces through semantic tokens"
```

---

### Task 7: Check in the scanner and drive to zero

The scanner has lived in a scratchpad. Checking it in makes the phase's completion criterion reproducible rather than a one-off measurement.

**Files:**
- Create: `frontend/scripts/scan-palette.mjs`
- Modify: `frontend/package.json` (add the `scan:palette` script)

**Interfaces:**
- Consumes: a running dev server and backend, started per the `frontend:verify` skill.
- Produces: exit code 0 when zero off-palette colours are found, 1 otherwise, plus a per-route breakdown on stdout.

- [ ] **Step 1: Create the scanner**

Create `frontend/scripts/scan-palette.mjs`:

```js
/**
 * Off-palette colour scanner. Walks every visible element on the app routes in
 * both themes and reports any computed colour that is not in the design system.
 *
 * Alpha is kept in the comparison key on purpose: rgba(255,255,255,.14) is the
 * dark --border, and collapsing it to #ffffff would report a false positive.
 *
 * Usage: node scripts/scan-palette.mjs [baseUrl]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "http://localhost:5199";

const SHARED = ["#a3402f", "#8a3223", "#f2e5e1", "#c0392b", "#c98a2b", "#2f6b4f"];

const BADGES_LIGHT = [
  "#f8efed", "#8d3020", "#db9f95", "#f8f2ed", "#6f4725", "#c9a98d",
  "#f7f5ed", "#5e4f21", "#bdac7a", "#f2f6ee", "#3e5b29", "#9ab587",
  "#eff6f2", "#2d5c45", "#91b6a3", "#eef5f6", "#2c5963", "#90b4bb",
  "#eef2f6", "#365278", "#a0b0c5", "#f6eef4", "#783662", "#c7a3bb",
];
const BADGES_DARK = [
  "#401d17", "#e5a59a", "#894134", "#302318", "#d2a884", "#6c5037",
  "#2c2617", "#c9b373", "#605534", "#20281a", "#99bf7d", "#4a5c3d",
  "#1d2a24", "#88bfa3", "#425c4f", "#1c292c", "#87bac4", "#3f5a5f",
  "#202832", "#9fb4d0", "#47576b", "#32202c", "#d2a3c2", "#714b65",
];

const LIGHT_OK = [
  ...SHARED, ...BADGES_LIGHT,
  "#ffffff", "#faf8f3", "#f4f1ea", "#16202e", "#2b3646", "#6f6a5e",
  "#c9c4b8", "#efeae0",
  "#141923@0.34", "#141923@0.1",
];
const DARK_OK = [
  ...SHARED, ...BADGES_DARK,
  "#0e1a17", "#14231e", "#12201c", "#eaf0ec", "#c5d0ca", "#7f938a",
  "#c47a5f", "#d18f76", "#d9614e", "#d9a854", "#5aa37d", "#16261f", "#2a3b35",
  "#ffffff@0.24", "#ffffff@0.08",
];

const ROUTES = [
  ["app-home", "/app"],
  ["workspace", "/deal/acme_saas"],
  ["portfolio", "/portfolio"],
];

const hex = (s) => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(s || "");
  if (!m) return null;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (a === 0) return null;
  const h = (n) => (+n).toString(16).padStart(2, "0");
  return "#" + h(m[1]) + h(m[2]) + h(m[3]) + (a < 1 ? "@" + a : "");
};

const collect = () =>
  Array.from(document.querySelectorAll("body *")).flatMap((el) => {
    if (/^(script|style|meta|link|title|head|svg|path|defs|g)$/i.test(el.tagName)) return [];
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return [];
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") return [];
    const tag = el.tagName.toLowerCase();
    const cls = (typeof el.className === "string" ? el.className : "").slice(0, 45);
    const where = cls ? `${tag}.${cls.trim().split(/\s+/).slice(0, 2).join(".")}` : tag;
    const out = [];
    const ownText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (ownText) out.push({ prop: "color", val: cs.color, where });
    out.push({ prop: "bg", val: cs.backgroundColor, where });
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none")
      out.push({ prop: "border", val: cs.borderTopColor, where });
    return out;
  });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
const inputs = page.locator("input");
await inputs.nth(0).fill("admin@vyntic.com");
await inputs.nth(1).fill("admin");
await page.getByRole("button", { name: /continue/i }).click();
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 });
await page.waitForTimeout(1500);

let total = 0;
for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => localStorage.setItem("vyntic_theme", t), theme);
  const OK = theme === "light" ? LIGHT_OK : DARK_OK;
  for (const [name, route] of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const rows = await page.evaluate(collect);
    const tally = {};
    for (const r of rows) {
      const h = hex(r.val);
      if (!h || OK.includes(h)) continue;
      tally[h] = tally[h] || { n: 0, where: new Set() };
      tally[h].n++;
      if (tally[h].where.size < 3) tally[h].where.add(r.where);
    }
    const keys = Object.keys(tally);
    total += keys.length;
    console.log(`${name}-${theme}: ${keys.length} off-palette`);
    for (const k of keys.sort((a, b) => tally[b].n - tally[a].n))
      console.log(`    ${k}  x${tally[k].n}  ${[...tally[k].where].join(" , ")}`);
  }
}

await browser.close();
console.log(total === 0 ? "\nPASS — zero off-palette colours" : `\nFAIL — ${total} off-palette colours`);
process.exit(total === 0 ? 0 : 1);
```

- [ ] **Step 2: Register the script**

In `frontend/package.json`, add to `"scripts"`:

```json
    "scan:palette": "node scripts/scan-palette.mjs"
```

- [ ] **Step 3: Start the servers**

Follow the `frontend:verify` skill to bring up the backend and a dev server. The scanner defaults to `http://localhost:5199`; pass a different base URL as the first argument if the skill starts Vite on another port.

- [ ] **Step 4: Run the scan**

Run: `npm run scan:palette`
Expected on first run: a non-zero count. Every reported colour is a real finding — the whitelist already covers all 48 badge values and both border alphas.

- [ ] **Step 5: Fix what it reports**

For each reported colour, locate it with `grep -rn "<hex>" src/` and route it through the appropriate token. Re-run the scan after each fix. Do not add colours to the scanner's whitelist to make it pass — the whitelist is the design system's definition, and widening it defeats the check.

- [ ] **Step 6: Confirm zero**

Run: `npm run scan:palette`
Expected: `PASS — zero off-palette colours`, exit code 0.

- [ ] **Step 7: Verify the full suite, typecheck and build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/scan-palette.mjs package.json src/
git commit -m "test(frontend): check in the off-palette scanner, phase 1 at zero"
```

---

## Done when

- `npm run scan:palette` exits 0 — zero off-palette colours on `/app`, `/deal/:id` and `/portfolio` in both themes.
- `npx vitest run` passes (188 existing + 20 new = 208).
- `npx tsc --noEmit` and `npm run build` pass.
- ESLint warnings at or below baseline.

## Deliberately not in this phase

- **Typography** — families, scale, the `.font-mono-dm` load bug. Phase 2, planned separately once this lands, because its decomposition depends on measured reflow.
- **Badge persistence and picker UI** — the store, additive migration, admin-only route and picker that let an admin actually choose a tone. Separate feature plan; Task 4's `STAGE_TONES` becomes its fallback map.
- **Radii and the landing page** — out of scope per spec D4.

## Open questions for the implementer

- **The `oxblood` tone versus `--soft`.** `--soft` (`#f2e5e1`) means active/selected app-wide, and the palette's oxblood chip (`#f8efed`) sits close to it. Task 5 assigns oxblood to JPY, which is rare enough to be low-risk, and Task 4 assigns it to no stage. If the two read ambiguously in place, drop oxblood from `BADGE_TONES` and ship seven selectable tones.

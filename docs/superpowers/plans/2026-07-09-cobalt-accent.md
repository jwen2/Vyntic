# Cobalt Accent System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ink accent (`#111111`) and stray blues with a theme-aware cobalt accent token system across landing + app, per `docs/superpowers/specs/2026-07-09-cobalt-accent-design.md`.

**Architecture:** CSS variables in `index.css` are the single source of truth (light `:root`, dark `.dark` — ThemeContext already toggles the `dark` class on `<html>`, and Tailwind `darkMode: "class"` matches). TS constants (`ACCENT`) and `ddTheme` keys become `var()` strings; alpha-tinting moves to `color-mix()` so it works on `var()` strings; Tailwind's `blue` scale is overridden with cobalt-tuned values so the ~45 existing `blue-*` class usages (DocMatrixPanel, landing sections) retune without file edits.

**Tech Stack:** React 18 + TypeScript, Tailwind (class dark mode), vitest, inline-style theming via `ddTheme()` (pre-F3.5).

## Global Constraints

- Accent values (from spec, exact): light `--accent: #1d4ed8`, `--accent-strong: #1e40af`, `--accent-tint: #e7edfb`, `--accent-tint-border: #b6c6ee`, `--on-accent: #ffffff`; dark `--accent: #8ab4ff`, `--accent-strong: #8ab4ff`, `--accent-tint: rgba(138,180,255,0.12)`, `--accent-tint-border: rgba(138,180,255,0.35)`, `--on-accent: #0f0f0f`.
- **Ink-vs-accent test** for every `ACCENT` usage: brand/identity (logo squares, inverse nav/panels, Closed/Committed badge) stays literal ink `#111111`; emphasis/interactive (buttons, active nav, selection, links, live indicators) becomes the accent token.
- Untouched, verbatim: `SEV_COLOR`, stage badges, `GREEN #22c55e`, `AMBER #f59e0b`, `RED #ef4444`, `VIOLET #5f5f57`, body text/borders/surfaces, secondary/ghost buttons.
- No structural refactors in god components (`DealBriefDashboard`, `TabularRun`, `DocMatrixPanel`) — value swaps only; F3 decomposes them later.
- Every accent **fill** pairs with `color: "var(--on-accent)"` (white-on-`#8ab4ff` fails contrast in dark).
- `color-mix()` requires Chrome 111+/Safari 16.2+/FF 113 — acceptable (internal tool, evergreen browsers).
- All commands run from `frontend/`: `npm run lint`, `npm run build`, `npm test -- --run`.

---

### Task 1: Accent tokens + global focus ring

**Files:**
- Modify: `frontend/src/index.css` (`:root` block at ~line 7; `:focus-visible` rule at ~line 26)

**Interfaces:**
- Produces: CSS vars `--accent`, `--accent-strong`, `--accent-tint`, `--accent-tint-border`, `--on-accent` in both themes. All later tasks consume these.

- [ ] **Step 1: Add tokens.** Append inside the existing `:root` block:

```css
  /* Cobalt accent scale — measured: #1d4ed8 6.7:1 w/ white, #1e40af 8.7:1 on white */
  --accent: #1d4ed8;
  --accent-strong: #1e40af;
  --accent-tint: #e7edfb;
  --accent-tint-border: #b6c6ee;
  --on-accent: #ffffff;
```

After the `:root` block, add:

```css
/* Dark theme accent — ThemeContext toggles .dark on <html>. #8ab4ff: 8.6:1 on #171717. */
.dark {
  --accent: #8ab4ff;
  --accent-strong: #8ab4ff;
  --accent-tint: rgba(138, 180, 255, 0.12);
  --accent-tint-border: rgba(138, 180, 255, 0.35);
  --on-accent: #0f0f0f;
}
```

- [ ] **Step 2: Focus ring.** Change the `:focus-visible` rule's outline from `currentColor` to the accent (keep offset and comment shape):

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Verify.** Run `npm run build` → succeeds. `npm run dev`, tab through the landing page in light, toggle dark in `/app` and tab: focus rings are cobalt in light, periwinkle in dark.
- [ ] **Step 4: Commit.** `git add src/index.css && git commit -m "feat(frontend): cobalt accent tokens + accent focus ring"`

---

### Task 2: `tint()` → color-mix; ACCENT re-point; alpha-concat sweep

**Files:**
- Modify: `frontend/src/components/dd/types.ts` (ACCENT at line 78; DD_DARK/DD_LIGHT)
- Modify: `frontend/src/components/workflows/theme.ts` (ACCENT line 9, `tint()` lines 15–20)
- Test: `frontend/src/components/workflows/theme.test.ts` (new)
- Modify (alpha-concat sweep): `dd/DealAssistantPanel.tsx:360`, `dd/DocumentDetailView.tsx:235,309`, `dd/DocumentsModal.tsx:220–222`, `dd/LeftSidebar.tsx:265`

**Interfaces:**
- Produces: `ACCENT === "var(--accent)"` (both modules); `tint(color: string, alphaPct: number): string` returning `color-mix(in srgb, <color> <pct>%, transparent)` — works on hex AND `var()` strings; `ddTheme()` objects gain `accent`, `accentStrong`, `accentTint`, `accentTintBorder`, `onAccent` keys.

- [ ] **Step 1: Write the failing test** (`theme.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { tint, ACCENT } from "./theme";

describe("tint", () => {
  it("emits color-mix for hex colors", () => {
    expect(tint("#22c55e", 15)).toBe("color-mix(in srgb, #22c55e 15%, transparent)");
  });
  it("works on CSS var strings (the accent token)", () => {
    expect(tint(ACCENT, 50)).toBe("color-mix(in srgb, var(--accent) 50%, transparent)");
  });
});
```

- [ ] **Step 2: Run it — must fail.** `npm test -- --run theme.test` → FAIL (tint still emits 8-digit hex; ACCENT is `#111111`).
- [ ] **Step 3: Implement.** In `workflows/theme.ts`, replace ACCENT and `tint()`:

```ts
export const ACCENT = "var(--accent)";

/** Alpha wash via color-mix — works on hex AND var() strings (8-digit hex can't). */
export function tint(color: string, alphaPct: number): string {
  return `color-mix(in srgb, ${color} ${alphaPct}%, transparent)`;
}
```

In `dd/types.ts`: `export const ACCENT = "var(--accent)";` and add to **both** `DD_DARK` and `DD_LIGHT` (values identical — the vars flip with the `.dark` class):

```ts
  accent: "var(--accent)",
  accentStrong: "var(--accent-strong)",
  accentTint: "var(--accent-tint)",
  accentTintBorder: "var(--accent-tint-border)",
  onAccent: "var(--on-accent)",
```

**`tint` lives in `dd/types.ts`** (workflows/theme already documents "Reuses ddTheme tokens", so the dependency direction is workflows → dd). Define the function above in `dd/types.ts`, and in `workflows/theme.ts` replace the old implementation with a re-export: `export { tint } from "@/components/dd/types";` — existing `import { tint } from "./theme"` callers keep working, and the test in Step 1 exercises the re-export path.

- [ ] **Step 4: Alpha-concat sweep** — hex-suffix concatenation breaks on `var()` strings; replace each (`88`→53, `66`→40, `33`→20, `22`→13):
  - `DealAssistantPanel.tsx:360`: `` `${ACCENT}88` `` → `tint(ACCENT, 53)`
  - `DocumentDetailView.tsx:235,309`: `` `${ACCENT}66` `` → `tint(ACCENT, 40)`
  - `DocumentsModal.tsx:220`: `ACCENT + "22"` → `tint(ACCENT, 13)`; `:222`: `ACCENT + "66"` → `tint(ACCENT, 40)`
  - `LeftSidebar.tsx:265`: `` `${ACCENT}33` `` → `tint(ACCENT, 20)`
  - Each file imports `tint` from `"./types"` (dd) alongside its existing ACCENT import.
- [ ] **Step 5: Grep guard.** `rg 'ACCENT\}|ACCENT \+ "' frontend/src` → zero matches. `npm test -- --run` → all pass (incl. 32 characterization tests). `npm run lint && npm run build` → green.
- [ ] **Step 6: Commit.** `git commit -am "feat(frontend): ACCENT reads cobalt var; tint() via color-mix; alpha-concat sweep"`

---

### Task 3: Accent fills get `--on-accent`; ink audit; spinner + FlagItem blues

**Files:**
- Modify: `pages/DealWorkspacePage.tsx:210`, `dd/TopBar.tsx:67,72`, `dd/DealBriefDashboard.tsx:703,922,1682`, `dd/DocumentDetailView.tsx:217`, `dd/DealAssistantPanel.tsx:430,503,656`, `dd/LeftSidebar.tsx:93,279`, `workflows/AssistantEditor.tsx:289,403,649`, `workflows/DocumentSelectorModal.tsx:304,325`, `workflows/MemoOutput.tsx:200`, `components/ProtectedRoute.tsx:16`, `dd/FlagItem.tsx:142,239`

**Interfaces:**
- Consumes: Task 1 vars, Task 2 ACCENT.

- [ ] **Step 1: Ink audit (the one deliberate NON-conversion).** `dd/TopBar.tsx:67,72` is the **logo square** — brand ink, stays monochrome. Replace `ACCENT` with literal ink so it doesn't turn cobalt:

```tsx
background: isDark ? "#f5f5f5" : "#111111",
// …
color: isDark ? "#111111" : "white",
```

(`TopBar.tsx:359` — the mode-toggle active pill — is active nav: keep ACCENT.) Check every other file in this task's list against the ink-vs-accent test from Global Constraints as you edit; the expectation is all remaining sites are interactive/emphasis and keep ACCENT.

- [ ] **Step 2: on-accent pairing.** At every accent **fill** site listed above (background is `ACCENT` or a conditional resolving to ACCENT), change the paired text/icon color from `"white"`/`"#fff"` to `"var(--on-accent)"`. Example (`DealWorkspacePage.tsx:210`):

```tsx
style={{ padding: "8px 14px", background: ACCENT, color: "var(--on-accent)", border: "none", borderRadius: 999, cursor: "pointer" }}
```

Conditional fills (e.g. `DealAssistantPanel.tsx:430` `background: isStreaming || draft.trim() ? ACCENT : c.border`) also switch their paired color to `"var(--on-accent)"` — acceptable for the non-accent branch in both themes (white on `c.border` light-gray is the current behavior pattern; verify visually in Step 4).

- [ ] **Step 3: Off-palette blues.**
  - `ProtectedRoute.tsx:16`: `border: "3px solid #2563eb"` → `border: "3px solid var(--accent)"` (fixes the FE13 off-palette spinner).
  - `FlagItem.tsx:142`: `borderLeft: "2px solid #3b82f6"` → `"2px solid var(--accent)"`.
  - `FlagItem.tsx:239`: `background: "#2563eb"` → `"var(--accent)"`; set that element's text color to `"var(--on-accent)"` (read the surrounding JSX to find the pair).
- [ ] **Step 4: Verify.** `npm run lint && npm run build && npm test -- --run` green. Dev-server pass in **both themes**: workspace primary buttons cobalt with legible text (near-black text on periwinkle in dark), logo square still ink, assistant send button, sidebar active items, spinner cobalt.
- [ ] **Step 5: Commit.** `git commit -am "feat(frontend): accent fills pair with on-accent; ink audit; off-palette blues to tokens"`

---

### Task 4: AnswerText citation chips onto accent tokens

**Files:**
- Modify: `frontend/src/components/dd/AnswerText.tsx:460–477` (citation chip style; imports at top)

**Interfaces:**
- Consumes: Task 1 vars, Task 2 `tint`/ACCENT from `"./types"`.

- [ ] **Step 1: Replace the hardcoded blue chip styles.** Current block (lines 465–475) hardcodes 10 tailwind-blue hexes with `isDark` branches. Replace with tokens — the vars carry the theming, so the `isDark` branches collapse:

```tsx
background: active ? "var(--accent-tint)" : tint(ACCENT, 8),
border: `1px solid ${active ? "var(--accent)" : "var(--accent-tint-border)"}`,
color: "var(--accent-strong)",
// … (fontSize, fontWeight, cursor, margin, lineHeight unchanged)
boxShadow: active ? "0 0 0 2px var(--accent-tint-border)" : "none",
```

Add `tint` to the existing import from `"./types"`. If `isDark` becomes unused in this component after the change, remove it from the destructure (lint will flag it).

- [ ] **Step 2: Verify.** `npm test -- --run` green (characterization tests cover AnswerText parsing, not colors — they must stay green). Dev pass: open a deal answer with citations in both themes — chips legible, active chip visibly stronger, no black-on-navy.
- [ ] **Step 3: Commit.** `git commit -am "feat(frontend): citation chips read accent tokens"`

---

### Task 5: Tailwind blue scale → cobalt; landing CTA

**Files:**
- Modify: `frontend/tailwind.config.js` (theme.extend)
- Modify: `frontend/src/components/landing/ui/LandingButton.tsx:19` (primary variant)
- Check only (no edits expected): `frontend/src/lib/matrixColumnConfig.ts` — has 2 blue references; if they are `blue-*` classes they retune automatically, if hex literals convert to `var(--accent)`.

**Interfaces:**
- Produces: all existing `blue-*` classes (DocMatrixPanel ~27, landing sections ~18) render cobalt-tuned values. No component files change for this.

- [ ] **Step 1: Override the blue scale** in `tailwind.config.js`:

```js
  theme: {
    extend: {
      colors: {
        // Cobalt accent scale (spec 2026-07-09-cobalt-accent-design.md).
        // Existing blue-* usages retune to the brand accent; 900/950 stay
        // near Tailwind defaults (used only as dark washes).
        blue: {
          50: "#eef3fc",
          100: "#e7edfb",
          200: "#b6c6ee",
          300: "#93aee4",
          400: "#8ab4ff",
          500: "#1d4ed8",
          600: "#1d4ed8",
          700: "#1e40af",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
    },
  },
```

- [ ] **Step 2: Landing primary CTA** (`LandingButton.tsx:19`) — the primary variant goes from inverse ink to accent:

```ts
    "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] hover:bg-[var(--accent-strong)]",
```

Logo squares, inverse nav banner, and inverse panels/sections keep `--landing-inverse` (ink) — do not touch `LandingNav`, `LandingSection`, `LandingPanel`, `LandingFooter`, `LoginPage`.

- [ ] **Step 3: matrixColumnConfig check.** `rg -n 'blue|#3b82f6|#2563eb' frontend/src/lib/matrixColumnConfig.ts` — classes: leave; hex: replace with `var(--accent)`.
- [ ] **Step 4: Verify.** `npm run build` green. Dev pass: landing page — hero CTA cobalt, section eyebrows/links/pricing highlight cobalt-tuned (they were Tailwind blue before, so the shift is subtle); DocMatrixPanel in both themes — sort highlights, add-column button, streaming cursor all cobalt; CSV badge legible.
- [ ] **Step 5: Commit.** `git commit -am "feat(frontend): tailwind blue scale retuned to cobalt; landing CTA to accent"`

---

### Task 6: Full verification + design-system baseline card

**Files:**
- Modify: none in repo (visual pass + external design-system card update)

- [ ] **Step 1: Full gates.** `npm run lint && npm run build && npm test -- --run` — all green, zero new lint warnings beyond the pre-existing 54.
- [ ] **Step 2: Visual pass, both themes:** landing (hero, features, pricing, testimonials, footer), login, home (sidebar, deal list, top bar), deal workspace (all tabs: brief, findings, documents, matrix, assistant), workflows (library, editors, runs, compare), modals (documents, confirm, selector). Checklist per accent role: primary buttons, active nav, selection washes, links/citations, focus ring, spinners/streaming, one stat highlight max; severity chips adjacent to accent show no red/blue vibration.
- [ ] **Step 3: Update the claude.ai/design baseline** (`foundations/palette.html` in the "Vyntic Design System" project) via DesignSync: add the accent scale row (5 light + 5 dark swatches with measured ratios) and change the subtitle line "Monochrome shell; hue is reserved for finding severity" to "Monochrome shell + cobalt accent; severity hues unchanged". Re-register only if the card doesn't refresh.
- [ ] **Step 4: Session wrap.** Record the cobalt outcome in the auto-memory `lp-readiness-roadmap` note (the repo-root `MEMORY.md` is deliberately untracked — don't commit it).

---

**Selection-affordance note (deliberate spec deviation):** existing selection states (assistant doc pills, sidebar active items, DocMatrix sort highlights, compare anchors) already have geometry — they recolor to accent via the ACCENT/tint swaps above; no new 3px inset bars are added anywhere. The spec's "inset bar" wording came from the candidate mockups and is amended to match.

# Card Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 18 hand-rolled card containers in `frontend/src/components/dd/brief/` with a shared `<Card>` primitive that owns the brief's three-step radius system.

**Architecture:** `components/ui/Card.tsx` + `card.css`, following the established `Button`/`Modal` pattern exactly — `forwardRef`, no `theme` prop, every colour from a CSS custom property, geometry in a sibling stylesheet imported from `main.tsx`. A `level` prop (`hero`/`panel`/`inner`) sets radius and default padding; a `tone` prop (`surface`/`alt`/`alert`) sets background and border colour. A new `--card-hero-shadow` token moves the hero elevation out of an `isDark` branch.

**Tech Stack:** React 18 + TypeScript, Tailwind (semantic colour aliases only), plain CSS for the primitive, Vitest + Testing Library, Playwright-core driving headless Edge for in-app verification.

**Spec:** `docs/superpowers/specs/2026-07-25-card-primitive-design.md`
**Branch:** `feat/design-system-card` (already created, off `feat/fe5.6-brief-theming`)

## Global Constraints

- **Radius always comes from `level`.** There is no `radius` prop. Every migrated site lands on one of the three levels.
- **Padding comes from `level`** unless the site passes `padding` — only the three table wrappers (`padding={0}`) and `BriefStatCard` (`padding="12px 14px"`) do.
- **Exactly six sites change visually.** `BriefStatCard` r20→18; `EditableField` r16→18 and vertical padding 10→12; `DiffRow` vertical padding 10→12; `EmptyBrief` padding 24→20 and gains the hero shadow. **Every other site must render byte-identically** — that is what Task 4 verifies.
- **`BriefHeader` keeps its `theme` prop.** It forwards `theme` to `StatusPill`. Only the `boxShadow` branch goes away.
- **Do not migrate pills or badges** (`borderRadius: 99` / `999`): `StatusPill`, `SourcePill`, `CountBadge`, `FreshnessPill`, `DiffPill`, `SourceChip`, `SegmentedTabs`. Different primitive, not this plan.
- **`card.css` loads after Tailwind utilities** (same as `button.css` — see the note in `ConfirmDialog.tsx:42`). A `.card--panel { padding: 16px }` rule therefore *beats* a consumer's `p-4` utility class. Consumers must use the `padding` prop, never a Tailwind padding utility.
- Gate after every task: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`, plus `npx eslint src` (baseline: **0 errors**, ~49 warnings — no new errors permitted).

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/components/ui/Card.tsx` | **Create.** The component: prop → class-name mapping, padding escape hatch, ref/div passthrough. |
| `frontend/src/components/ui/card.css` | **Create.** All geometry and colour: base, 3 levels, 3 tones, dashed modifier. |
| `frontend/src/components/ui/Card.test.tsx` | **Create.** Unit tests for the mapping and passthrough behaviour. |
| `frontend/src/main.tsx` | **Modify.** One import line, after `modal.css`. |
| `frontend/src/index.css` | **Modify.** `--card-hero-shadow` in `:root` and in `.dark`. |
| `brief/BriefHeader.tsx`, `EmptyBrief.tsx` | **Modify.** Task 2 — hero level. |
| `brief/BriefPanel.tsx`, `ActionsPanel.tsx`, `DiffPanel.tsx`, `ThesisPanel.tsx`, `FindingsPanel.tsx`, `FinancialPanel.tsx` | **Modify.** Task 2 (panel shells) and Task 3 (their inner cards). |
| `brief/parts.tsx` | **Modify.** Task 3 — `BriefStatCard`. |

---

## Task 1: The Card primitive

**Files:**
- Create: `frontend/src/components/ui/Card.tsx`, `frontend/src/components/ui/card.css`, `frontend/src/components/ui/Card.test.tsx`
- Modify: `frontend/src/main.tsx` (import), `frontend/src/index.css` (token)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export default Card`, plus named type exports `CardLevel = "hero" | "panel" | "inner"` and `CardTone = "surface" | "alt" | "alert"`. Props: `{ level: CardLevel; tone?: CardTone; dashed?: boolean; padding?: number | string }` intersected with `Omit<ComponentPropsWithoutRef<"div">, keyof CardOwnProps>`. Tasks 2 and 3 import it as `import Card from "@/components/ui/Card";`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/Card.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import Card from "./Card";

afterEach(() => {
  cleanup();
});

describe("Card", () => {
  it("composes base, level, and tone class names", () => {
    render(
      <Card level="panel" data-testid="c">
        body
      </Card>
    );
    const el = screen.getByTestId("c");
    expect(el.className).toContain("card");
    expect(el.className).toContain("card--panel");
    expect(el.className).toContain("card--surface");
  });

  it("defaults to the surface tone", () => {
    render(
      <Card level="inner" data-testid="c">
        body
      </Card>
    );
    expect(screen.getByTestId("c").className).toContain("card--surface");
  });

  it("supports every level", () => {
    render(
      <>
        <Card level="hero" data-testid="hero" />
        <Card level="panel" data-testid="panel" />
        <Card level="inner" data-testid="inner" />
      </>
    );
    expect(screen.getByTestId("hero").className).toContain("card--hero");
    expect(screen.getByTestId("panel").className).toContain("card--panel");
    expect(screen.getByTestId("inner").className).toContain("card--inner");
  });

  it("supports the alt and alert tones", () => {
    render(
      <>
        <Card level="inner" tone="alt" data-testid="alt" />
        <Card level="inner" tone="alert" data-testid="alert" />
      </>
    );
    expect(screen.getByTestId("alt").className).toContain("card--alt");
    expect(screen.getByTestId("alert").className).toContain("card--alert");
  });

  it("adds the dashed modifier only when asked", () => {
    render(
      <>
        <Card level="hero" dashed data-testid="dashed" />
        <Card level="hero" data-testid="solid" />
      </>
    );
    expect(screen.getByTestId("dashed").className).toContain("card--dashed");
    expect(screen.getByTestId("solid").className).not.toContain("card--dashed");
  });

  it("applies the padding escape hatch as an inline style", () => {
    render(
      <>
        <Card level="inner" padding={0} data-testid="zero" />
        <Card level="inner" padding="12px 14px" data-testid="custom" />
      </>
    );
    expect(screen.getByTestId("zero").style.padding).toBe("0px");
    expect(screen.getByTestId("custom").style.padding).toBe("12px 14px");
  });

  it("sets no inline padding when the prop is omitted", () => {
    render(<Card level="panel" data-testid="c" />);
    expect(screen.getByTestId("c").style.padding).toBe("");
  });

  it("lets a caller's style override the padding prop", () => {
    render(
      <Card level="inner" padding={0} style={{ padding: 4 }} data-testid="c" />
    );
    expect(screen.getByTestId("c").style.padding).toBe("4px");
  });

  it("appends the consumer className instead of replacing it", () => {
    render(
      <Card level="panel" className="overflow-hidden" data-testid="c" />
    );
    const el = screen.getByTestId("c");
    expect(el.className).toContain("card--panel");
    expect(el.className).toContain("overflow-hidden");
  });

  it("preserves other inline styles alongside the padding prop", () => {
    render(
      <Card level="panel" style={{ minHeight: 220 }} data-testid="c" />
    );
    expect(screen.getByTestId("c").style.minHeight).toBe("220px");
  });

  it("forwards the ref and passes unknown div props through", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Card level="inner" ref={ref} id="probe" title="a card" data-testid="c" />
    );
    expect(ref.current).toBe(screen.getByTestId("c"));
    expect(ref.current?.id).toBe("probe");
    expect(ref.current?.title).toBe("a card");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/Card.test.tsx`
Expected: FAIL — `Failed to resolve import "./Card"`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ui/Card.tsx`:

```tsx
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";

export type CardLevel = "hero" | "panel" | "inner";
export type CardTone = "surface" | "alt" | "alert";

interface CardOwnProps {
  /** Nesting depth — sets the radius and the default padding. */
  level: CardLevel;
  /** Surface treatment. `alert` is the critical wash used by deal-breaker stats. */
  tone?: CardTone;
  /** Dashed border (pre-run empty states). Colour is unchanged; only the style. */
  dashed?: boolean;
  /**
   * Escape hatch for the handful of sites whose padding is deliberate — the
   * financial table wrappers pass 0 and pad their own cells. Prefer the level
   * default. Never use a Tailwind padding utility here: card.css loads after
   * the utilities, so `.card--panel`'s padding would win.
   */
  padding?: number | string;
}

export type CardProps = CardOwnProps &
  Omit<ComponentPropsWithoutRef<"div">, keyof CardOwnProps>;

/**
 * Shared card primitive for the brief's nested panels. All colour comes from
 * CSS custom properties (see card.css / index.css), so it themes with the
 * `.dark` class and takes no `theme` prop — the same contract as <Button> and
 * <Modal>. See docs/superpowers/specs/2026-07-25-card-primitive-design.md.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { level, tone = "surface", dashed = false, padding, className, style, children, ...rest },
  ref
) {
  const classes = ["card", `card--${level}`, `card--${tone}`];
  if (dashed) classes.push("card--dashed");
  if (className) classes.push(className);

  // `style` spreads last so a caller can still win in a pinch.
  const merged: CSSProperties | undefined =
    padding === undefined ? style : { padding, ...style };

  return (
    <div ref={ref} className={classes.join(" ")} style={merged} {...rest}>
      {children}
    </div>
  );
});

export default Card;
```

- [ ] **Step 4: Write the stylesheet**

Create `frontend/src/components/ui/card.css`:

```css
/* Shared <Card> primitive — one styling source for the brief's nested panels.
   Every colour resolves from a CSS custom property (see index.css), so the card
   themes automatically with the `.dark` class on <html> and needs no `theme`
   prop — the same contract as <Button> / button.css.

   Three levels mirror the nesting depth the brief already used before it was
   decomposed: hero (the outermost card) > panel > inner. */

.card {
  border: 1px solid var(--border);
  background: var(--surface);
}

/* Levels — radius + default padding. Consumers override padding via the
   `padding` prop (inline style), never a Tailwind utility: this file loads
   after the utility layer and would win. */
.card--hero {
  border-radius: 28px;
  padding: 20px;
  box-shadow: var(--card-hero-shadow);
}

.card--panel {
  border-radius: 24px;
  padding: 16px;
}

.card--inner {
  border-radius: 18px;
  padding: 12px;
}

/* Tones — background + border colour. */
.card--surface {
  background: var(--surface);
  border-color: var(--border);
}

.card--alt {
  background: var(--surface-alt);
  border-color: var(--border);
}

.card--alert {
  background: var(--status-critical-tint);
  border-color: var(--status-critical-tint-border);
}

/* Style only — the tone still owns the colour. */
.card--dashed {
  border-style: dashed;
}
```

- [ ] **Step 5: Add the hero-shadow token**

In `frontend/src/index.css`, add to the `:root` block immediately after the `--modal-shadow` / `--z-modal` lines:

```css
  /* Hero-card elevation — the brief's outermost card (see ui/card.css).
     Unlike --modal-shadow, which is a colour, this holds the whole box-shadow
     value: the light treatment has two layers and the dark one has a single
     deeper layer, so they differ in shape, not just tint. */
  --card-hero-shadow: 0 12px 30px rgba(17, 17, 17, 0.11), 0 1px 2px rgba(17, 17, 17, 0.05);
```

And in the `.dark` block, immediately after its `--modal-shadow` line:

```css
  --card-hero-shadow: 0 16px 34px rgba(0, 0, 0, 0.44);
```

Both values are transcribed verbatim from `BriefHeader.tsx`'s current `boxShadow` ternary — do not re-tune them here.

- [ ] **Step 6: Import the stylesheet**

In `frontend/src/main.tsx`, add after the existing `import "./components/ui/modal.css";` line:

```ts
import "./components/ui/card.css";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/Card.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 8: Run the full gate**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build && npx eslint src`
Expected: tsc silent; **182 tests** pass (171 + 11); build succeeds; eslint 0 errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ui/Card.tsx frontend/src/components/ui/card.css frontend/src/components/ui/Card.test.tsx frontend/src/main.tsx frontend/src/index.css
git commit -m "feat(frontend): Card primitive with level/tone geometry (DS3)"
```

---

## Task 2: Migrate the hero and panel cards

Eight outermost containers. Seven must render byte-identically; `EmptyBrief` is one of the six agreed visual changes.

**Files:**
- Modify: `frontend/src/components/dd/brief/BriefHeader.tsx`, `EmptyBrief.tsx`, `BriefPanel.tsx`, `ActionsPanel.tsx`, `DiffPanel.tsx`, `ThesisPanel.tsx`, `FindingsPanel.tsx`, `FinancialPanel.tsx`

**Interfaces:**
- Consumes: `import Card from "@/components/ui/Card";` — `<Card level="hero" | "panel" tone?="surface" dashed? style? />` from Task 1.
- Produces: nothing new. Component signatures are unchanged except `BriefHeader`, which keeps every prop it has.

- [ ] **Step 1: `BriefHeader` — hero**

In `BriefHeader.tsx`, add `import Card from "@/components/ui/Card";` below the existing `Button` import. Replace:

```tsx
  <div
    className="border border-edge bg-surface"
    style={{
      borderRadius: 28,
      padding: "20px",
      boxShadow: theme === "dark"
        ? "0 16px 34px rgba(0,0,0,0.44)"
        : "0 12px 30px rgba(17,17,17,0.11), 0 1px 2px rgba(17,17,17,0.05)",
    }}
  >
```

with:

```tsx
  <Card level="hero">
```

and change the matching closing `</div>` (the last one before `);` at the end of the component) to `</Card>`.

**`theme` stays in the props and in the `<StatusPill … theme={theme} />` call.** It is no longer used for the shadow, but `StatusPill`'s hue washes still need it — do not delete the prop.

- [ ] **Step 2: `EmptyBrief` — hero, dashed (visual change)**

In `EmptyBrief.tsx`, add `import Card from "@/components/ui/Card";`. Replace:

```tsx
    <div
      className="border border-dashed border-edge bg-surface"
      style={{
        padding: "24px",
        borderRadius: 28,
      }}
    >
```

with:

```tsx
    <Card level="hero" dashed>
```

and its closing `</div>` with `</Card>`.

This is a deliberate change: padding 24 → 20, and the card gains `--card-hero-shadow`. Both are in the spec's agreed list.

- [ ] **Step 3: `BriefPanel` — panel with `minHeight`**

In `BriefPanel.tsx`, add `import Card from "@/components/ui/Card";`. Replace:

```tsx
    <div
      className="border border-edge bg-surface"
      style={{
        padding: 16,
        borderRadius: 24,
        minHeight: 220,
      }}
    >
```

with:

```tsx
    <Card level="panel" style={{ minHeight: 220 }}>
```

and the matching closing `</div>` with `</Card>`. Leave `EditableField` alone — it is Task 3.

- [ ] **Step 4: `ActionsPanel` — panel**

In `ActionsPanel.tsx`, add `import Card from "@/components/ui/Card";`. Replace:

```tsx
    <div
      className="border border-edge bg-surface"
      style={{
        padding: 16,
        borderRadius: 24,
      }}
    >
```

with `<Card level="panel">`, and its closing `</div>` with `</Card>`.

- [ ] **Step 5: `DiffPanel` — panel**

In `DiffPanel.tsx`, add `import Card from "@/components/ui/Card";`. Replace:

```tsx
    <div
      className="border border-edge bg-surface"
      style={{
        borderRadius: 24,
        padding: "16px",
      }}
    >
```

with `<Card level="panel">`, and the matching closing `</div>` with `</Card>`. Leave `DiffRow` alone — Task 3.

- [ ] **Step 6: `ThesisPanel`, `FindingsPanel`, `FinancialPanel` — panel**

Each of these three has the identical opening container:

```tsx
    <div
      className="border border-edge bg-surface"
      style={{
        padding: 16,
        borderRadius: 24,
      }}
    >
```

In each file add `import Card from "@/components/ui/Card";`, replace that container with `<Card level="panel">`, and change its matching closing `</div>` to `</Card>`.

Take care in `FinancialPanel.tsx`: it contains **four** `className="border border-edge bg-surface…"` containers. Only the outermost one (the one whose style is `padding: 16, borderRadius: 24`) changes in this step. The three `borderRadius: 18, overflow: "hidden"` table wrappers are Task 3.

- [ ] **Step 7: Run the gate**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build && npx eslint src`
Expected: tsc silent; 182 tests pass; build succeeds; eslint 0 errors.

Then confirm the migration is complete for this level:

Run: `cd frontend && grep -rn "borderRadius: 2[48]" src/components/dd/brief/`
Expected: **no matches** — every 24 and 28 is now Card's.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/dd/brief/
git commit -m "refactor(frontend): migrate brief hero+panel cards to <Card> (DS3)"
```

---

## Task 3: Migrate the inner cards

Ten containers. Seven must render byte-identically; `EditableField`, `DiffRow`, and `BriefStatCard` carry the remaining agreed visual changes.

**Files:**
- Modify: `frontend/src/components/dd/brief/BriefPanel.tsx`, `DiffPanel.tsx`, `FindingsPanel.tsx`, `ThesisPanel.tsx`, `FinancialPanel.tsx`, `parts.tsx`

**Interfaces:**
- Consumes: `<Card level="inner" tone="alt" | "alert" | "surface" padding? className? style? />` from Task 1.
- Produces: nothing new. All component signatures unchanged.

- [ ] **Step 1: `EditableField` — inner, alt (visual change)**

In `BriefPanel.tsx` (the `Card` import is already there from Task 2), replace:

```tsx
    <div
      className="border border-edge bg-surface-alt"
      style={{
        minWidth: 0,
        padding: "10px 12px",
        borderRadius: 16,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
```

with:

```tsx
    <Card
      level="inner"
      tone="alt"
      style={{ minWidth: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
```

and its matching closing `</div>` with `</Card>`. Deliberate change: radius 16 → 18, vertical padding 10 → 12.

- [ ] **Step 2: `DiffRow` — inner, alt (visual change)**

In `DiffPanel.tsx`, replace:

```tsx
    <div
      className="border border-edge bg-surface-alt"
      style={{
        padding: "10px 12px",
        borderRadius: 18,
        minWidth: 0,
      }}
    >
```

with:

```tsx
    <Card level="inner" tone="alt" style={{ minWidth: 0 }}>
```

and its closing `</div>` with `</Card>`. Deliberate change: vertical padding 10 → 12.

- [ ] **Step 3: `FindingsPanel` finding card — inner, alt**

Replace:

```tsx
              <div
                key={finding.id}
                className="border border-edge bg-surface-alt"
                style={{
                  padding: 12,
                  borderRadius: 18,
                  minWidth: 0,
                }}
              >
```

with:

```tsx
              <Card
                key={finding.id}
                level="inner"
                tone="alt"
                style={{ minWidth: 0 }}
              >
```

and its matching closing `</div>` with `</Card>`.

- [ ] **Step 4: `ThesisColumn` — both paths, inner, alt**

In `ThesisPanel.tsx`, replace the empty-state container:

```tsx
      <div className="border border-edge bg-surface-alt" style={{ padding: 12, borderRadius: 18, minHeight: 110 }}>
```

with:

```tsx
      <Card level="inner" tone="alt" style={{ minHeight: 110 }}>
```

and the populated container:

```tsx
    <div className="border border-edge bg-surface-alt" style={{ padding: 12, borderRadius: 18 }}>
```

with:

```tsx
    <Card level="inner" tone="alt">
```

Change both matching closing `</div>` tags to `</Card>`.

- [ ] **Step 5: `FinancialChart` — inner, alt**

In `FinancialPanel.tsx`, replace:

```tsx
    <div className="border border-edge bg-surface-alt" style={{ padding: 12, borderRadius: 18 }}>
```

with `<Card level="inner" tone="alt">`, and its closing `</div>` with `</Card>`.

- [ ] **Step 6: The three table wrappers — inner, surface, `padding={0}`**

Still in `FinancialPanel.tsx`, `FinancialTableView`, `MetricsTable`, and `SimpleFinancialTable` each open with:

```tsx
    <div className="border border-edge bg-surface" style={{ borderRadius: 18, overflow: "hidden" }}>
```

Replace each with:

```tsx
    <Card level="inner" padding={0} className="overflow-hidden">
```

and each matching closing `</div>` with `</Card>`.

`overflow-hidden` moves to `className` because it is a Tailwind utility, not card geometry — and `overflow` is not a property `card.css` sets, so there is no ordering conflict.

- [ ] **Step 7: `BriefStatCard` — inner, alt/alert (visual change)**

In `parts.tsx`, add `import Card from "@/components/ui/Card";` below the existing imports. Replace:

```tsx
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 20,
        border: `1px solid ${isAlert ? "var(--status-critical-tint-border)" : "var(--border)"}`,
        background: isAlert ? "var(--status-critical-tint)" : "var(--surface-alt)",
      }}
    >
```

with:

```tsx
    <Card level="inner" tone={isAlert ? "alert" : "alt"} padding="12px 14px">
```

and its matching closing `</div>` with `</Card>`. Deliberate change: radius 20 → 18. The `isAlert` ternaries inside the card (the label colour) stay exactly as they are.

- [ ] **Step 8: Run the gate**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build && npx eslint src`
Expected: tsc silent; 182 tests pass; build succeeds; eslint 0 errors.

- [ ] **Step 9: Confirm no hand-rolled card shapes remain**

Run: `cd frontend && grep -rn "borderRadius: 1[68]\|borderRadius: 20" src/components/dd/brief/`
Expected: **no matches.**

Run: `cd frontend && grep -rn 'className="border border-edge bg-surface' src/components/dd/brief/`
Expected: **no matches** — every such container is now a `<Card>`. (`border-b border-edge` on table cells is a different shape and legitimately remains.)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/dd/brief/
git commit -m "refactor(frontend): migrate brief inner cards to <Card> (DS3)"
```

---

## Task 4: Verify and document

Splits by risk, because a screenshot cannot prove a 1px radius delta but *can* show whether an intended change looks right.

**Files:**
- Create: a throwaway driver in the session scratchpad (not committed)
- Modify: `docs/todo/2026-07-24-design-system-primitives.md`, `docs/todo/README.md`

**Interfaces:**
- Consumes: the migrated components from Tasks 2 and 3.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Start the stack**

```powershell
$env:ALLOW_INSECURE_DEFAULTS="1"
Set-Location D:\projects\Vyntic\backend; New-Item -ItemType Directory -Force data | Out-Null
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8801
```

```powershell
$env:VITE_API_PROXY_TARGET="http://localhost:8801"
Set-Location D:\projects\Vyntic\frontend; npm run dev -- --port 5199 --strictPort
```

Both in the background. The backend takes ~30–60s before `:8801` answers. **Do not run the backend `pytest` suite while these are up** — its autouse fixture drops and recreates the same SQLite file the dev server uses.

- [ ] **Step 2: A/B computed-style diff for the 14 unchanged sites**

Reuse the FE5.6 driver at `scratchpad/verify-fe56.mjs` as the harness (login, mocked Proactive Scan run via Playwright route interception on `**/api/deals/*/workflows/*/runs`, `**/api/runs/*/stream-token` → 503). For each unchanged site, inject a sibling `<div>` carrying the *pre-migration* inline styles next to the live `<Card>`, then diff `borderRadius`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `backgroundColor`, `borderTopColor`, `borderTopWidth`, and `borderTopStyle` via `getComputedStyle`.

This is the DS3b technique — it beat screenshots there for exactly this class of claim.

The 14 that must match on all nine properties (four sites carry the intended changes and are excluded — `EmptyBrief`, `EditableField`, `DiffRow`, `BriefStatCard`):

| Site | old inline style |
|---|---|
| `BriefHeader` | `borderRadius: 28, padding: "20px"` + the old shadow ternary |
| `BriefPanel` | `padding: 16, borderRadius: 24, minHeight: 220` |
| `ActionsPanel` | `padding: 16, borderRadius: 24` |
| `DiffPanel` | `borderRadius: 24, padding: "16px"` |
| `ThesisPanel` | `padding: 16, borderRadius: 24` |
| `FindingsPanel` | `padding: 16, borderRadius: 24` |
| `FinancialPanel` | `padding: 16, borderRadius: 24` |
| finding card | `padding: 12, borderRadius: 18, minWidth: 0` |
| `ThesisColumn` ×2 | `padding: 12, borderRadius: 18` (+ `minHeight: 110`) |
| `FinancialChart` | `padding: 12, borderRadius: 18` |
| 3 table wrappers | `borderRadius: 18, overflow: "hidden"` |

Run in **both** themes. Any mismatch is a bug in Task 2 or 3 — fix it before continuing.

For `BriefHeader` specifically, assert the resolved `boxShadow` string matches what the old ternary produced in that theme; this is the one property where the token could silently differ.

- [ ] **Step 3: Before/after screenshots for the six intended changes**

Capture each in both themes and **look at them** — this step is a judgement call, not a checkbox:

1. `BriefStatCard` radius 20 → 18 (the stat row, including the `alert` deal-breaker card)
2. `EditableField` radius 16 → 18 and padding 10 → 12 (the KV panel; note the panel gets taller)
3. `DiffRow` padding 10 → 12 (seed the diff via `localStorage.setItem("vyntic_brief_diff_acme_saas", …)`, then click the "N changes" pill)
4. `EmptyBrief` padding 24 → 20 (reachable by mocking the runs list as `[]`)
5. `EmptyBrief` gains the hero shadow (same screenshot)
6. `BriefHeader` shadow via token — confirm visually unchanged against the Step 2 assertion

If any of these looks wrong rather than merely different, stop and raise it rather than proceeding.

- [ ] **Step 4: Stop the servers and confirm the ports are free**

```powershell
Get-NetTCPConnection -LocalPort 5199,8801 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { taskkill /PID $_ /T /F 2>&1 | Out-Null }
Get-NetTCPConnection -LocalPort 5199,8801 -State Listen -ErrorAction SilentlyContinue
```

Expected: the second command prints nothing. A `TaskStop` on a background dev server has repeatedly *not* killed it on this machine — verify, don't assume.

- [ ] **Step 5: Update the design-system plan and index**

In `docs/todo/2026-07-24-design-system-primitives.md`, mark DS3 Step 2 done and record what was built (three levels, three tones, the `--card-hero-shadow` token, 18 call sites, the six intended visual changes, and that app-wide Card plus Input remain deferred pending a look decision).

In `docs/todo/README.md`, update the DS row to say the Card primitive shipped brief-scoped, and add this plan to the table.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs(todo): record the Card primitive (DS3 Step 2)"
```

---

## Definition of done

- `<Card>` exists in `components/ui/` with 11 passing unit tests, following the `Button`/`Modal` contract (no `theme` prop, colour from CSS vars, stylesheet imported in `main.tsx`).
- All 18 brief card containers render through it; `grep -rn 'className="border border-edge bg-surface' src/components/dd/brief/` returns nothing.
- The 14 unchanged sites are proven identical by computed-style diff in both themes.
- The six intended changes are screenshotted in both themes and reviewed.
- `tsc` / 182 tests / `build` / `eslint` (0 errors) all green.
- One commit per task.

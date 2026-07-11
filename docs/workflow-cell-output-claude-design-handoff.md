# Claude Design Handoff — Workflow Cell Output Hierarchy

**Date:** 2026-07-11  
**Product:** Vyntic LP diligence workflows  
**Implementation plan:** `docs/todo/2026-07-11-workflow-cell-output-visual-hierarchy.md`  
**Starting point:** PR #102 / Hillpath Fund IV demo data

## Assignment

Please design a clearer presentation system for extracted workflow-cell insights. The current grid is technically shape-aware, but it visually flattens rich answers: Markdown bold is shown as literal/plain text or discarded, multi-item insights lose separation, long prose becomes only its first sentence, and citations move away from the claims they support.

We need a focused evolution of the existing workflow UI, not a wholesale redesign. The table must remain useful for comparing documents and funds horizontally.

## What is happening technically

The backend stores both the raw answer and an optional typed value. Rich content has not been lost at extraction time.

The main loss occurs in `frontend/src/components/workflows/cells/CellRenderer.tsx`:

1. `stripSourceMarkers()` removes `[Source N]` from the raw answer.
2. `normalizeFormat()` maps free `markdown` into the prose path.
3. `proseValue()` creates a first-sentence summary.
4. `ProseCell` displays `value.summary || value.body`; because summary is normally present, the body is hidden.
5. Prose/list/key-value text is rendered as plain JSX, so inline Markdown emphasis is not interpreted.
6. Citations are shown in a separate footer row, up to four at a time.

The selected-cell detail in `TabularRun.tsx` already uses `frontend/src/components/dd/AnswerText.tsx`, which understands headings, bold, lists, tables, severity tags, and inline citations. Assistant and memo outputs also use this richer renderer. The design should help us converge these surfaces on one visual grammar.

## Representative content to design with

Use these synthetic Hillpath examples rather than generic lorem ipsum:

### Rich risk list

```md
- Fund III reported TVPI of **1.50x**, while DPI plus RVPI equals **1.56x**, creating a reconciliation mismatch [Source 1].
- CedarCloud's 2026 budget EBITDA includes a **$3m add-back** [Source 1].
- Redwood Compliance is below cost at **$19m NAV** versus **$34m invested cost** [Source 1].
```

### Terms with conflicting evidence

```md
**Waterfall:** The PPM describes a European / whole-of-fund waterfall [Source 1]. Section 7.4 of the LPA permits investment-by-investment distributions with a 30% carry escrow [Source 2]. Treat the operative structure as **hybrid** and confirm with counsel.
```

### Key-person provision

```md
**Trigger:** the investment period suspends only if both Evelyn Hart and Marcus Lee cease substantially all business time [Source 1].

**Gap:** a single-founder departure does not automatically suspend investing, and no named successor cures the event [Source 1].
```

### Side-letter obligations

```md
1. **Fee discount** — reduce the management fee by 0.25% while the investor maintains at least $35m of commitments [Source 1].
2. **MFN package** — deliver within 45 days after final close [Source 1].
3. **ESG reporting** — deliver within 55 days after quarter-end [Source 1].
```

Also cover a one-line metric, “Not found,” an error cell, a Markdown table, and an answer with more than four sources.

## Surfaces in scope

1. Tabular grid — compact density.
2. Tabular grid — comfortable density.
3. Selected-cell detail sidebar.
4. Compare view, insofar as it should reuse the same answer grammar.

Assistant checkpoint and memo outputs are references for rich rendering, but do not redesign those screens unless consistency requires a small shared-token recommendation.

## Design questions to resolve

1. How much content belongs directly in compact and comfortable cells?
2. Should comfortable cells expand inline, rely on selection, or support both?
3. How should an overflow affordance communicate hidden bullets/paragraphs without adding noise to every cell?
4. Should citations remain inline, appear as a footer summary, or use a hybrid rule by answer shape?
5. How should bold emphasis, labels, caveats, and risk severity coexist without making every cell visually loud?
6. What happens to a Markdown table in a 140–200px column?
7. How do selected, hovered, keyboard-focused, expanded, retrying, missing, and error states differ?
8. How should row-height variance be constrained so users can still compare across columns?

## Constraints

- Preserve the existing table, density toggle, column resizing, selected-cell sidebar, retry action, and document viewer.
- Default column width is approximately 200px; minimum is 140px; users can expand to 1200px.
- Support light and dark themes.
- Source citations must remain clickable and must open the correct document/page.
- Do not depend on hover-only interactions.
- Do not use raw HTML from the model.
- Do not solve this by stripping Markdown in prompts.
- Prefer existing colors and visual language; introduce tokens only where a clear hierarchy is missing.
- Avoid a card-within-every-cell aesthetic that makes the grid heavy.

## Requested deliverables

Please return:

1. An annotated current-state critique tied to the four surfaces above.
2. High-fidelity light and dark designs for:
   - compact cell,
   - comfortable cell,
   - selected/expanded cell,
   - selected-cell detail.
3. Examples for metric, prose, list, key/value, free Markdown, missing, and error shapes.
4. Behavior at 140px, 200px, 320px, and wide/expanded columns.
5. Interaction states and keyboard behavior.
6. A small specification table containing typography, spacing, line limits, overflow treatment, citation style, and severity colors.
7. Implementation notes that identify reusable components rather than one-off screen styling.
8. A recommendation for whether the current `AnswerText` visual language should be reused, simplified, or replaced by shared primitives.

If providing code, use React/TypeScript-compatible JSX and avoid adding a new UI framework. Treat the visuals and behavior specification as canonical; engineering will adapt code to repository conventions.

## Success criteria

The final design should let an LP analyst scan a row quickly, notice key values and risks, understand when more content exists, and open the full answer and supporting source without losing their place. Bold values and list separation should visibly survive from model output to the grid, while compact mode remains genuinely compact.

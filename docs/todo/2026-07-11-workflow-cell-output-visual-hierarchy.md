# Plan UX1 — Rich Workflow Cell Outputs & Visual Hierarchy

> **For implementation agents:** obtain the Claude Design deliverables in `docs/workflow-cell-output-claude-design-handoff.md` before choosing final dimensions, typography, or expand/collapse behavior. Preserve raw answers and citation behavior throughout.

**Status:** planned; design handoff ready

**Goal:** Make extracted workflow insights readable and visually structured inside the tabular grid without sacrificing comparison density, citations, accessibility, or compatibility with existing runs.

**Depends on:** PR #102; coordinate implementation with Plan F3.2 because both touch `TabularRun.tsx`.

## Problem statement

The extraction service already returns Markdown-rich answers, but the primary grid loses much of that hierarchy:

- `markdown` columns fall through `normalizeFormat()` to the prose renderer.
- `stripSourceMarkers()` removes inline citation placement before a cell is rendered.
- `proseValue()` always produces a summary, and `ProseCell` renders `summary || body`, so comfortable cells normally show only the first sentence.
- Prose, list items, and key/value values are inserted as plain JSX text, so `**bold**`, headings, rules, and inline emphasis are not rendered.
- Citations are regrouped into a small row at the bottom rather than appearing next to the claims they support.
- The selected-cell sidebar uses `AnswerText` and retains much more structure, creating a large fidelity gap between the grid and detail view.

The desired outcome is not “show every answer at full length.” The grid must remain a comparison surface. The design needs a deliberate hierarchy for preview, expansion, and full-detail reading.

## Product principles

1. Preserve meaning before decoration: bold, bullets, headings, caveats, and claim-level citations must survive.
2. Progressive disclosure: compact comparison first, richer comfortable cells second, full answer in selection/detail view.
3. Shape-aware rendering: metrics should stay compact; prose, lists, key/value output, and Markdown should not share one generic treatment.
4. One rendering grammar: grid, selected-cell detail, Compare view, assistant output, and memo output should share safe Markdown primitives and citation labels.
5. No prompt workaround: do not ask the model to emit flatter text to compensate for a weak renderer.
6. Backward compatibility: old runs with only `answer` and new runs with `answer_formatted` must both render cleanly.

## Task UX1.1 — Design current-state audit

**Files to inspect:**

- `frontend/src/components/workflows/cells/CellRenderer.tsx`
- `frontend/src/components/workflows/TabularRun.tsx`
- `frontend/src/components/workflows/CompareView.tsx`
- `frontend/src/components/dd/AnswerText.tsx`
- `frontend/src/components/workflows/AssistantRun.tsx`
- `frontend/src/components/workflows/MemoOutput.tsx`

- [ ] Capture the same representative cells in compact, comfortable, selected-detail, and Compare views.
- [ ] Include Markdown prose, bullets with bold values, key/value terms, a long caveat, missing data, a table, and 4+ citations.
- [ ] Mark which hierarchy is lost versus merely hidden by density.
- [ ] Confirm light and dark theme behavior at narrow, default, and expanded column widths.

**Acceptance:** annotated current-state screenshots and a short list of the highest-impact failures, using actual Hillpath Fund IV outputs where possible.

## Task UX1.2 — Resolve the presentation model

Claude Design should recommend one coherent model for:

- [ ] Compact cell preview: maximum lines, emphasis rules, citation treatment, and overflow signal.
- [ ] Comfortable cell: visible body depth, section spacing, bullet limits, and whether expansion is per-cell or selection-driven.
- [ ] Selected-cell detail: full-fidelity Markdown, provenance, retry action, and source-document handoff.
- [ ] Shape-specific hierarchy for metric, date, boolean, enum, prose, list, key/value, and free Markdown.
- [ ] Missing/out-of-scope/error states that are visibly distinct without dominating the grid.
- [ ] Claim-level citations versus a source summary row.

**Recommended starting hypothesis:** keep compact mode to a semantic preview; let comfortable mode show up to roughly 4–6 readable lines with a clear overflow affordance; keep the selected-cell detail as the untruncated canonical answer.

**Acceptance:** approved designs for the three reading levels and explicit behavior at 140px, 200px, 320px, and expanded column widths.

## Task UX1.3 — Build shared rich-text primitives

**Likely files:** create `frontend/src/components/rich-output/`; refactor `AnswerText.tsx`; modify `CellRenderer.tsx`.

- [ ] Extract safe inline rendering for bold, severity labels, and `[Source N]` citations from `AnswerText`.
- [ ] Extract block primitives for paragraphs, headings, lists, rules, and tables.
- [ ] Support a `variant` or equivalent API for `cell-preview`, `cell-comfortable`, and `detail` instead of duplicating parsers.
- [ ] Keep raw HTML disabled; do not introduce unsanitized `dangerouslySetInnerHTML`.
- [ ] Preserve citation click behavior and source numbering in every variant.
- [ ] Render old-run raw Markdown when `answer_formatted` is absent.

**Acceptance:** one source of truth renders bold/list/table/citation fixtures consistently in the grid and detail panel.

## Task UX1.4 — Upgrade shape-aware cells

- [ ] Give free `markdown` a first-class render path rather than silently treating it as ordinary prose.
- [ ] Prose cells show intentional summary/body hierarchy; comfortable mode must not always discard the body.
- [ ] List items retain inline bold and claim-level citations; show a meaningful “+N more” affordance when truncated.
- [ ] Key/value cells support emphasis and wrap values cleanly instead of flattening long clauses.
- [ ] Metrics retain unit/period and compact scanability.
- [ ] Caveats use restrained severity styling and remain readable without becoming a wall of chips.
- [ ] Tables use bounded horizontal overflow or a deliberate preview—not broken columns inside a narrow cell.

**Acceptance:** representative Hillpath results preserve bold values, bullet separation, caveats, and citations while the grid remains scannable.

## Task UX1.5 — Interaction, accessibility, and responsive behavior

- [ ] Make expansion and selection keyboard accessible with visible focus.
- [ ] Do not rely on hover for the only retry, expand, or citation affordance.
- [ ] Give icon-only controls accessible names and at least a 24px effective target.
- [ ] Ensure nested citation/expand controls do not accidentally change cell selection.
- [ ] Verify screen-reader order for answer, caveats, and citations.
- [ ] Verify row height changes do not make horizontal comparison disorienting.
- [ ] Respect reduced-motion preferences for expansion transitions.

**Acceptance:** keyboard-only completion of select, expand, cite, close, and retry flows; no clipped focus rings in the table.

## Task UX1.6 — Tests and visual QA

**Automated tests:**

- [ ] Bold and bold-with-citation render correctly.
- [ ] Ordered/unordered lists retain separation and inline formatting.
- [ ] Markdown headings, rules, and tables use the approved preview behavior.
- [ ] Comfortable prose exposes body content; compact prose truncates deliberately.
- [ ] Citation holes are skipped without renumbering the wrong source.
- [ ] Old-run raw answers and new structured answers both render.
- [ ] Missing, out-of-scope, error, running, and retry states remain distinct.

**Manual matrix:**

- [ ] Light and dark themes.
- [ ] Compact, comfortable, Compare, and selected-detail views.
- [ ] 140px, 200px, 320px, and expanded columns.
- [ ] Track Record Grid, Fund Terms Extractor, DDQ Gap Scan, and Side Letter Extractor.
- [ ] Long answer, one-line answer, no answer, 1 citation, and 5+ citations.

Run `npm test -- --run`, `npm run build`, and lint. Capture before/after screenshots from Hillpath Fund IV for the PR.

## Definition of done

- Bolding and list structure are visible in the grid where authored.
- Comfortable mode exposes meaningful body content instead of only the first sentence.
- The selected-cell detail remains the canonical untruncated answer.
- Citations remain claim-adjacent where possible and always open the correct document/page.
- No raw HTML/XSS regression and no prompt changes are required for visual correctness.
- Existing runs, exports, retries, density persistence, and light/dark themes continue to work.

## Explicitly out of scope

- Changing extraction prompts solely for visual styling.
- Regenerating existing workflow answers.
- Replacing the full workflow grid or introducing a new design system.
- Redesigning exports; export formatting can follow in a separate plan after the in-app hierarchy is stable.

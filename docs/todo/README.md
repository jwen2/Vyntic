# docs/todo — Open Implementation Plans

Actionable, not-yet-started implementation plans. Each is task-by-task and test-first (execute with superpowers:executing-plans). As a plan is completed, move it to `docs/finished/`.

Sources: `docs/assessments/2026-07-02-resiliency-security-assessment.md` (Plans 1–5), `docs/assessments/2026-07-07-frontend-audit.md` (Plans F1–F3).

## Institutional-LP readiness (resiliency + security)

Ordered by the assessment's tiers. Tiers 0–1 are concrete code on the current stack; Tier 2 plans lead with **Decisions required** because they carry architecture forks.

| # | Plan | Tier | Findings | Depends on | Status |
|---|---|---|---|---|---|
| 1 | `2026-07-02-tier0-security-hotfixes.md` | 0 — before any exposure | S1, S3, R1-guard, S9-CORS | — | **done (PR #91)** — moved to `docs/finished/` |
| 2 | `2026-07-02-auth-access-control-audit.md` | 1 — before paid pilot | S1-cross, S4, S5, S6, S9-XSS | Plan 1 | **done (PR #95)** |
| 3 | `2026-07-02-durable-ingestion-parsing.md` | 1 — before paid pilot | R4, R5 | — | **done (PR #91)** — moved to `docs/finished/` |
| 4 | `2026-07-02-postgres-multitenancy.md` | 2 — before multi-tenant | R2, S2, R6, S7, S8 | **tenancy decision (D1)** | blocked on decisions |
| 5 | `2026-07-02-horizontal-scaling-context-cascade.md` | 2 — before multi-tenant | R3, R1-full | Plan 4 | blocked on Plan 4 |

## LP product repositioning

| # | Plan | Scope | Depends on | Status |
|---|---|---|---|---|
| LP1 | `2026-07-08-lp-template-packs-and-object-model-frontend.md` | 7 LP built-in templates + workflow entity-scoping; Manager page + Position panel | PR #94 (merged) | **done (PR #102)** — 21 entity-scoped built-ins, Manager page, Position panel, Hillpath Fund IV fixtures; second demo fund deferred |
| LP2 | `2026-07-11-lp-monitoring-wedge.md` | Capital-call queue + side-letter compliance tracker (LLM-suggests/analyst-confirms) + portfolio dashboard | LP1 | **implemented** on `feat/lp-monitoring-wedge`; auto-ingestion + notifications + QoQ deltas deferred |

## Frontend quality (audit 2026-07-07)

From `docs/assessments/2026-07-07-frontend-audit.md` (audited on `main` @ `19e6d04`, post PR #92). Independent of the tiers above; F1 touches no backend, F3 Task F3.4 adds two small backend stores and should coordinate with Plan 2 so the new routes are default-deny + audited.

| # | Plan | Scope | Findings | Depends on | Status |
|---|---|---|---|---|---|
| F1 | `2026-07-07-frontend-guardrails.md` | ESLint + hooks-rule fix, error boundaries, dead-code deletion, Vitest | FE1–FE3, FE7, FE13-part | — | **done** — moved to `docs/finished/` |
| F2 | `2026-07-07-frontend-data-layer.md` | typed errors, one SSE client, one upload path, TanStack Query (decided), code splitting | FE4, FE8, FE10, FE12 | F1 | **done** — moved to `docs/finished/` |
| F3 | `2026-07-07-frontend-decomposition-client-state.md` | god-component decomposition, typed-cell rendering (**D1**), findings/overrides → backend (**D2**), theming + a11y (**D3**) | FE5, FE6, FE9, FE11, FE13 | F1, F2; F3.4 coordinates with Plan 2 | **done (PR #101)** — `DocMatrixPanel`/`TabularRun` decomposed, brief KV/list cells typed, findings/overrides server-side, semantic CSS-var tokens landed. `ddTheme()` kept as a compat shim (102 call sites) rather than deleted — see DS2. `DealBriefDashboard` decomposition (FE5) still deferred |

| FE5 | `2026-07-25-fe5-brief-decomposition.md` | Decompose `DealBriefDashboard` (2,502 lines → 374 shell + `brief/` dir); characterization tests for the untested parsers first | — (last god component) | **done** — FE5.1–FE5.5 merged (PR #116); FE5.6 (ddTheme conversion + shim deletion) on `feat/fe5.6-brief-theming`. Decisions: **D1 tests-before-move**, **D2 extract first, restyle second**. Unblocks the Card primitive (62 of ~75 card sites lived here) |

## Workspace UX

| # | Plan | Scope | Depends on | Status |
|---|---|---|---|---|
| UX1 | `2026-07-23-recent-activity-workflow-runs.md` | Surface a deal's workflow runs alongside agent chats in the left-rail "Recent" (new `GET /deals/{id}/runs` route + `WorkflowsView` deep-link prop) | — (frontend-led + 1 additive backend route) | not started, 2 decisions in header (D1 grouped-vs-unified, D2 live status) |
| UX2 | `2026-07-29-docmatrix-think-tag-streaming.md` | Raw `<think>` reasoning text renders into Doc Matrix cells mid-stream: `stripThinkTags` only matches complete `<think>…</think>` pairs, so an unterminated streaming block survives; the "Reasoning…" branch meant to catch it is also unreachable | — | not started; **blocking question first** — confirm the models still emit `<think>` at all (nothing in `backend/app` does), else delete the state as vestigial. Found in DS-Grid review |

## Design system

| # | Plan | Scope | Depends on | Status |
|---|---|---|---|---|
| UI1 | `2026-07-23-button-design-system.md` | Shared `<Button>` component (5 variants, 3 sizes, states, hover "flare" motion) from the finalized Claude Design artifact; migrate first tranche (workflows, agent, `/app` shell) of 169 raw `<button>` call sites | PR #111 merged | **in progress** on `feat/button-design-system` — component + `button.css` + `--danger` tokens (D2 dedicated file, D3 = artifact burnt-orange `#c2410c`) + 10 tests; tranche-1 migrations done (WorkflowCard/Library, RunToolbar, DealAssistantPanel, LeftSidebar, HomeTopBar account trigger). Poor-fit buttons (RunCell, DealListItem, HomeTopBar Add-deal) deferred → UI2 |
| UI2 | `2026-07-24-button-system-v2.md` | Finish button rollout: unify app on one red (migrate `#ef4444` pills onto `--danger`), resolve deferred poor-fit buttons, migrate remaining ~140 call sites (incl. docmatrix Tailwind tree) | UI1 first tranche | **done** — §1–§3 + palette convergence merged (PR #114); long-tail non-action buttons + status-scale green/amber tokens optionally remain |
| DS | `2026-07-24-design-system-primitives.md` | Modal primitive (`components/ui/`) → `ddTheme(theme)` retirement (**775** refs, not 102) → Card/Panel primitive → Input/table normalization | UI1/UI2 pattern, F3.5 tokens | **done through app-wide primitive rollout on `feat/typography-phase2-spike`** — Modal, Button, Card, shared Input/Select/Textarea, radius/shadow tokens, and shared `.data-table` read-only table chrome are in place; obvious app fields and read-only tables are migrated. Only the behavior-heavy interactive grid chrome remains — see **DS-Grid** below |
| RS1 | `2026-07-26-oxblood-reskin-phase1.md` | Colour reskin to the oxblood/ivory system: curated 8-tone badge palette, contrast fixes (`--text-3`, `--border`), `--violet`→ink, retokenize `theme.ts`, palette-drive `stageBadges`/`matrixColumnConfig`, de-hardcode 5 app surfaces, check in the off-palette scanner | DS3 (PR #118, merged) | **done** — branch `feat/reskin-oxblood`, moved to `docs/finished/`. `npm run scan:palette` exits 0 on all app routes in both themes. **Phase 2 typography spike done** — see `docs/superpowers/spikes/2026-07-26-typography-phase2-reflow-findings.md`: reflow risk is low; proceed with largest-first inline-fontSize sweep, with targeted DocMatrix embedded-table visual check and a RunTable script fix before reusing the measurement harness. Badge persistence + picker UI are a separate feature plan |
| DS-Card | `2026-07-25-card-primitive.md` | `<Card level tone>` primitive (`components/ui/`) + `--card-hero-shadow` token; migrate the 18 card containers in `brief/` | FE5.6 | **done** — branch `feat/design-system-card`, spec `docs/superpowers/specs/2026-07-25-card-primitive-design.md`. All 18 `brief/` card containers migrated (8 hero/panel + 10 inner); the 14 unchanged sites proven byte-identical via computed-style A/B diff (30/30 checks, light+dark, zero mismatches) and the 6 spec-agreed visual deltas (`BriefStatCard` r20→18, `EditableField` r16→18 + pad 10→12, `DiffRow` pad 10→12, `EmptyBrief` pad 24→20 + gains the hero shadow, `BriefHeader` shadow moved to a token) screenshotted before/after and confirmed correct in both themes. `tsc`/182 tests/build/eslint all green. Brief-scoped by decision: the app's other surfaces are a tighter radius geometry (6–16px vs 18–28px) and unifying them is a look decision, not a refactor |
| DS-Grid | `2026-07-27-interactive-grid-chrome.md` | Extract shared interactive-grid chrome for Doc Matrix and Tabular Run while preserving sticky columns, resize handles, reorder, selection, retry, streaming, and memoization behavior | DS app primitive rollout | **done** — branch `feat/ds-grid-chrome`, all 5 checkboxes closed. Both grids on `components/ui/grid-table.css`; the one approved visual delta was Doc Matrix header padding `p-3` → `7px 12px 7px 9px` (header row 61.9px → 51.9px). Measured, light+dark: header font/line-height and sticky position/z-index unchanged, body row heights byte-identical. Doc Matrix's resize handle also gains a hover tint it never had (its inline `style` made the `hover:` class inert). Three body cells stay unmigrated by design — no `align-top`, so the shared `vertical-align: top` would flip them. This closes the UI fidelity work |

## Context strategy (hybrid full-context / RAG)

Spec: `docs/superpowers/specs/2026-07-29-hybrid-context-strategy-design.md`. Implements **Plan 5 Phase B** and **decouples it from the Plan 4 Postgres gate** — the strategy interface and lazy embedding need nothing from Postgres, so this track is executable on the current SQLite + Chroma stack.

| # | Plan | Scope | Depends on | Status |
|---|---|---|---|---|
| CS-A | `docs/superpowers/plans/2026-07-29-context-strategy-plan-a-measurement.md` | Per-call token accounting (`llm_calls` table, attribution ContextVar, cost route) + citation-accuracy eval harness (`backend/evals/`) + Gemini caching spike | — | **implemented** on branch `feat/context-strategy-measurement` (unmerged) — see follow-ups below |
| CS-B | not yet written | Cost: context caching, column batching **only if** the caching residual justifies breaking the per-cell claim/SSE/retry model | CS-A (spike answer + baseline) | unblocked — spike answered |
| CS-C | not yet written | Capacity: `ContextSelection`, fail-loud coverage, lazy + batch embedding, the per-document allocator, `CONTEXT_STRATEGY` enum | CS-A (eval), CS-B | blocked on CS-B |

CS-B and CS-C are deliberately unwritten: CS-B's shape depends on the spike's answer, and CS-C's thresholds are only tunable against CS-A's eval. The spike (`docs/superpowers/spikes/2026-07-29-gemini-context-caching-findings.md`) found implicit prefix caching already active at a 56.6% hit rate with **zero code change**, so CS-B does not need a native `google-genai` path.

### CS-A follow-ups (accepted debt, deliberately not fixed in CS-A)

| # | Item | Why it was deferred |
|---|---|---|
| CS-A1 | **Retries inflate run-level aggregates.** A retried cell records one `llm_calls` row per attempt, and `created_at` is the only key that could distinguish them — there is no attempt number. A run's `prompt_tokens` therefore over-states what a clean run would cost. | Needs a decision on whether the cost record should report *billed* spend (current behavior, arguably correct) or *logical* spend per cell. Not a bug until someone quotes a per-run figure. |
| CS-A2 | **`test_surface_vocabulary_is_used_in_source` greps `app/` for surface labels** rather than asserting behavior. It cannot catch a `with llm_call_context(...)` block scoped too narrowly to enclose its LLM call. | Partly retired: `tests/test_llm_attribution_integration.py` now drives `execute_cell` end-to-end and asserts a fully-attributed row. The grep test remains as a cheap vocabulary guard; the gap is that only `tabular_cell` has behavioral coverage. |
| CS-A3 | **`test_cost_route_smoke` asserts no response content** — it checks status 200 only. | Superseded in practice by `test_admin_reads_deal_cost`; left as-is rather than widening CS-A's diff. |
| CS-A4 | **The caching spike has no automated test.** Its findings live only in the spike doc, so a langchain upgrade that changes `usage_metadata` shape would not be caught. | Spikes are throwaway by design. The load-bearing part — `_apply_usage`'s accumulation semantics — *is* covered in `test_llm_token_accounting.py`. |
| CS-A5 | **`cache_read` accumulation semantics still unverified** (spike Q4). Observed non-zero exactly once, on a stream's final chunk — the one position where last-non-zero-wins and summing agree. | Needs a cached call whose answer streams over many chunks. **CS-B must not trust summed `cached_tokens` until this is resolved.** |
| CS-A6 | **A `with llm_call_context(...)` inside an async generator cannot restore the variable in the driving task.** Async generators do not own a context (PEP 568 was never implemented), so an abandoned generator is finalized in a different task and `reset()` cannot reach the original. The `ValueError` is now swallowed and attribution no longer depends on the variable surviving (`_record` takes a snapshot), so the observable defect is fixed — but the driving task keeps a stale value until it ends. | Benign for every current caller: the driving task is always a per-request SSE generator already being torn down. It stops being benign if a long-lived task ever drives one of these generators and then makes a further LLM call outside a context. The real fix is entering and exiting in one task, which means restructuring 4 streaming endpoints. |
| CS-A7 | **The streaming compare fan-out is labelled `chat_stream`,** while the non-streaming one is `compare_cell`. Compare spend therefore splits across two labels depending on endpoint. | No data is mixed — `_stream_deal_answer` has exactly one caller and nothing else uses `chat_stream` — so this is a naming fix, and renaming a surface label is a breaking change for any saved query against the table. |
| CS-A8 | **`asyncio.CancelledError` is not covered by the `outcome` handling.** Like `GeneratorExit` it is a `BaseException`, so a billed call cancelled mid-stream records `"error"`. | Practically unreachable: nothing in `app/` cancels an LLM-bearing task (`.cancel()` appears nowhere). Realistically only app shutdown. |

## Suggested order
1. Resolve **Plan 4 D1 tenancy decision**, then implement **Plan 4** → 2. **Plan 5**.
Frontend track (parallel): **F1 + F2 done** → **F3** (resolve D1–D3 first; align F3.4 with Plan 2).

Plans 1 and 3 shipped in PR #91 (Plan 3's concurrency decision resolved as the in-process pool over DB job rows), and Plan 2 shipped in PR #95. Plans 4–5 need the D1/D2/D3 decisions in Plan 4's header settled first — start with tenancy (D1), since it shapes the Postgres schema everything else builds on.

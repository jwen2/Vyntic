# Plan: Workflow runs in the deal-workspace "Recent" rail

**Status:** not started — 2 decisions in header
**Scope:** surface a deal's workflow runs alongside agent chats in the left-rail "Recent" section, with click-through into the run.
**Branch (when started):** `feat/recent-activity-runs`

## Context

The deal-workspace rail (`components/dd/LeftSidebar.tsx`) has a **Recent** section that lists **agent chats only** — `listConversations(dealId, "assistant")` → `ConversationEntry[]`. Clicking one calls `onSelectAssistantHistory` → switches to `agent` mode and loads that conversation.

Workflow runs (`WorkflowRun`, `lib/workflows.ts`) are a separate entity with separate storage and endpoints, and they never appear in Recent. Users doing diligence think in terms of "what did I do on this deal recently" — chats *and* runs. Making Recent a real activity view closes that gap and makes the rail materially more useful.

This was scoped after the 2026-07-23 deal-workspace chrome rebuild (persistent rail + nav + Recent). It is **frontend-led with one small additive backend route**; independent of the LP/tenancy tracks.

## Two architecture gaps (why this is a feature, not a tweak)

1. **No per-deal run list.** Runs are listed *per workflow*: `listRuns(dealId, workflowId)` → `GET /deals/{id}/workflows/{workflowId}/runs`. There is no "all runs for a deal" endpoint. Client-side merge (list workflows → N run requests) is chatty and fragile, so we add one route.
2. **`WorkflowsView` can't be deep-linked.** Props are `{ dealId, theme }`; it owns its screen state internally (`library / editor / create / run / memo`) and has no external "open run X" input. It *does* navigate to a `{ kind: "run", workflowId, runId }` screen internally, so the deep-link is a new prop that seeds that screen.

## Decisions required (resolve before Task 1)

- **D1 — layout: grouped vs unified.**
  - *Grouped (recommended v1):* a "Runs" subsection above/below the "Chats" subsection. No cross-type timestamp merge, clearest to scan, least ambiguity.
  - *Unified:* one "Recent activity" feed interleaving chats + runs by timestamp. More activity-stream, but needs strong visual differentiation so the two kinds don't blur.
  - **Recommendation: grouped v1.**
- **D2 — live status for in-progress runs.**
  - *v1 (recommended):* show the run's status **as of load** (a static chip: running / complete / error). No live subscription.
  - *v2 (deferred):* live status dot via `subscribeRun` for runs that are `running` when the rail mounts.
  - **Recommendation: static status v1.**

## Invariants to honor

- New backend route is **default-deny**: `require_deal_access` (read) — copy the dependency pattern from `routes_deals.py`. Runs must be tenant- and deal-scoped (never leak across deals/tenants — mirror the existing per-workflow runs route's access checks; extend `tests/test_cross_tenant.py` if a new access surface appears).
- **Stores over ORM-in-routes:** add the aggregation to the existing run store, returning Pydantic models. No new session handling in the route.
- **Additive-only schema:** no new columns needed — this is a read/aggregation over existing run rows.
- Frontend server-state via **TanStack Query**, keyed `["deal", dealId, "runs"]`, consistent with `conversations`.

---

## Tasks (test-first)

### Task 1 — Backend: `GET /deals/{id}/runs` (list runs across the deal)
- **Test first** (`tests/test_workflow_runs.py` or existing runs test module):
  - admin `client` sees runs from *multiple* workflows of the deal, newest-first, capped at a limit (e.g. 50).
  - `analyst_client` with `grant_analyst_access` can read; a non-granted analyst gets 403 (default-deny).
  - runs from another deal / another tenant are **not** returned.
- **Impl:** add `run_store.list_runs_for_deal(deal_id, limit)` aggregating runs across the deal's workflows, ordered by `created_at desc`. Add route `GET /deals/{deal_id}/runs` in the workflows router with `require_deal_access`. Return a **summary** shape (not full run payloads): `{ id, workflow_id, workflow_label, status, created_at }` — a new `DealRunSummary` Pydantic model to keep the list light.

### Task 2 — Frontend lib: `listDealRuns`
- Add `DealRunSummary` type + `export async function listDealRuns(dealId): Promise<DealRunSummary[]>` in `lib/workflows.ts` hitting the new route via the shared `request<T>()` helper.

### Task 3 — Frontend query + wiring in `DealWorkspacePage`
- Add `runsQuery = useQuery({ queryKey: ["deal", dealId, "runs"], queryFn: () => listDealRuns(dealId), enabled: !!dealId })`.
- Add `pendingRun` state: `{ workflowId, runId, signal } | null`, and `handleOpenRun(workflowId, runId)` → `setMode("workflows")` + set `pendingRun` (bump a signal so repeat-clicks re-fire).
- Pass runs + `onOpenRun` into the rail; pass `pendingRun` into `WorkflowsView`.

### Task 4 — `WorkflowsView` deep-link prop
- **Test first** (Vitest, if a WorkflowsView test harness is added — else a characterization test on the screen reducer): given `pendingRun={{workflowId, runId, signal}}`, on signal change WorkflowsView sets its screen to `{ kind: "run", workflowId, runId }`.
- **Impl:** add optional `pendingRun?: { workflowId: string; runId: string; signal: number }` prop; a `useEffect([pendingRun?.signal])` that `setScreen({ kind: "run", ... })` (guard first-mount like the assistant `newChatSignal` pattern). Loading the run itself already happens inside the run screen via `getRun`.

### Task 5 — Rail rendering (`LeftSidebar`)
- **Grouped (per D1=grouped):** under the existing chats list, add a **"Runs"** subsection: each row shows the workflow label, a status chip (`stageBadges`-style; reuse `workflows/theme.ts` status colors — GREEN/AMBER/RED), and the relative date. Row `onClick` → `onOpenRun(workflowId, runId)`.
- New rail props: `runs: DealRunSummary[]`, `onOpenRun: (workflowId, runId) => void`. Empty state ("No runs yet").
- Keep the run rows visually distinct from chat rows (a small "run" glyph vs the chat glyph) so the two kinds read differently even in grouped form.

### Task 6 — Polish + verify
- Icons, status chips, empty states in both light/dark; run rows truncate long workflow labels.
- Clicking a run from any mode lands on the Workflows tab **on that run's screen**.
- `cd backend && pytest -q` green; `cd frontend && npx tsc --noEmit && npm run build` green.
- `frontend:verify` headless-Edge screenshots of the rail (chats + runs) and a run opened from a Recent click, both themes.

## Out of scope (v2)
- Live status dots for in-progress runs (D2 v2) via `subscribeRun`.
- Unified/interleaved feed (if D1=grouped).
- Cross-deal / global activity view.

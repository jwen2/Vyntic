# Plan 1 — Tier-0 Security Hotfixes

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Commit per task.

**Source:** `docs/assessments/2026-07-02-resiliency-security-assessment.md` — Tier 0.

**Goal:** Close the findings that block *any* external exposure and need no new infrastructure: unauthenticated conversation routes (S1), unsafe-by-default secrets (S3), silent oversized-context truncation (R1-guard), and hardcoded-localhost CORS (S9-CORS).

**Scope guard:** current stack only (FastAPI + SQLite). No Postgres, no new services. Ships in a day.

**Prereqbranch:** cut from `main` (or stack on `fable-rearchitect` if unmerged). All four tasks are independent — ship as they land.

---

## Findings addressed

| ID | Finding | File |
|---|---|---|
| S1 | Conversation routes have zero auth — any caller can read/write/delete any deal's Q&A by `deal_id` | `app/api/routes_conversation.py` |
| S3 | `assert_production_secrets` only fires when `environment == "production"` is explicitly set — defaults sail through an unconfigured deploy | `app/config.py`, `app/main.py` |
| R1-guard | `load_deal_context` warns then sends an over-limit corpus to Gemini anyway → hard API error or silent truncation | `app/services/context_provider.py:112` |
| S9-CORS | CORS origins hardcoded to localhost ports | `app/main.py:31` |

> Note discovered during assessment: `conversation_store` is **in-memory** (`conversation_store.py:9`), contradicting the README's "persisted in SQLite" claim. Persisting it is out of scope here (see Plan 4); this plan only secures the endpoints as they are.

---

## Task 1.1 — Authenticate conversation routes (S1)

**Files:** modify `app/api/routes_conversation.py`; create `tests/test_conversation_auth.py`.

- [ ] **Step 1: Failing tests.** Using the authed `client` / `analyst_client` fixtures (added in the rearchitect work):
  - unauthenticated client (no token) → 401 on POST/GET/DELETE
  - analyst without access to `deal_id` → 403
  - analyst with granted access → 200
  - admin → 200
- [ ] **Step 2: Add auth to all three handlers.** Import `get_current_user, require_deal_access` and `UserRow`. Each handler gains `current_user: UserRow = Depends(get_current_user)` and calls `require_deal_access(current_user, deal_id)` before touching the store. Mirrors every other deal-scoped route.
- [ ] **Step 3:** Verify + commit — `fix(security): authenticate conversation history routes`

## Task 1.2 — Secrets fail-closed (S3)

Refuse shipped default secrets in **any** environment unless an explicit dev opt-in is set — so an unconfigured production deploy can't silently run on `admin`/`admin` and a `CHANGE-ME` signing key.

**Files:** modify `app/config.py`, `app/main.py`; extend `tests/test_prod_secrets_guard.py`.

- [ ] **Step 1: Failing tests.**
  - defaults + no opt-in → raises (regardless of `environment`)
  - defaults + `allow_insecure_defaults=True` → passes (dev)
  - real secrets → passes
- [ ] **Step 2: Rework the guard.** Add `allow_insecure_defaults: bool = False` to `Settings`. Rewrite `assert_production_secrets` → `assert_secure_secrets`: collect offenders (`jwt_secret_key` starts with `CHANGE-ME`; `default_admin_password == "admin"`); if any and not `allow_insecure_defaults`, raise `RuntimeError` naming them. Local dev sets `ALLOW_INSECURE_DEFAULTS=true` in `.env` explicitly.
- [ ] **Step 3:** Update `main.py` startup call; add `ALLOW_INSECURE_DEFAULTS=true` to `.env.example` with a comment that production must never set it. Verify + commit — `fix(security): reject default secrets unless explicit dev opt-in`

## Task 1.3 — Graceful oversized-context handling (R1-guard)

Never silently send an over-limit corpus. Deterministically cap to a char budget (reuse the synthesis approach) and surface a truncation flag so the UI can warn — this is the stopgap until the full context-strategy cascade (Plan 5).

**Files:** modify `app/services/context_provider.py`; create `tests/test_context_budget_guard.py`.

- [ ] **Step 1: Failing tests.** `load_deal_context` on a corpus over the char budget returns chunks whose total is within budget, in document/page order, and logs a warning; under budget returns everything.
- [ ] **Step 2: Implement.** Add `_FC_HARD_CHAR_BUDGET` (≈3.2M chars ~ 800K tokens). In `load_deal_context`, after building chunks, if `total_chars` exceeds it, truncate at a chunk boundary and log which docs were dropped (mirror `_select_synthesis_chunks`). Consider a module-level `last_context_truncated` marker or returning a small metadata tuple the caller can surface — keep minimal; the real fix is Plan 5.
- [ ] **Step 3:** Verify + commit — `fix(context): cap deal context at a hard budget instead of silently overflowing Gemini`

## Task 1.4 — Configurable CORS origins (S9-CORS)

**Files:** modify `app/config.py`, `app/main.py`.

- [ ] **Step 1:** Add `cors_origins: str = "http://localhost:3100,http://localhost:3200"` (comma-separated) to `Settings`. In `main.py`, split it for `allow_origins`. Document `CORS_ORIGINS` in `.env.example`.
- [ ] **Step 2:** Verify the app boots and the existing localhost origins still work. Commit — `chore(security): make CORS origins configurable for production`

---

## Definition of done
- New tests pass, full `pytest -v` green, one commit per task.
- Manual check: hitting `/deals/{id}/conversations` without a token returns 401.

# Plan 2 — Auth, Access Control & Audit

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Checkbox steps, commit per task.

**Source:** `docs/assessments/2026-07-02-resiliency-security-assessment.md` — Tier 1 security.

**Goal:** Make access control default-deny (S1-cross-cutting), add an audit trail (S4), fix token exposure + add revocation (S5), and gate account creation + throttle auth (S6). Plus the inline-file XSS review (S9). These are request/auth-layer changes on the current stack — a blocklist table and an audit table are the only new persistence.

**Prerequisite:** Plan 1 shipped. **Depends on nothing infra-wise**, but rate limiting is single-process here; the cross-replica version moves to Redis in Plan 5.

**Decision required before Task 2.4:** rate-limiter dependency. Options: (a) `slowapi` (SlowAPI, Starlette-native, simple), (b) hand-rolled in-memory limiter (zero deps, single-process only), (c) defer to Redis now (couples to Plan 5). **Recommended: (a) for a clean API, documented as single-process until Plan 5.** Confirm before implementing.

---

## Findings addressed

| ID | Finding |
|---|---|
| S1-cross | Access control is per-route opt-in; one missing decorator = full data-room leak. Need default-deny. |
| S4 | No audit logging — no record of who accessed which deal/document when. |
| S5 | 24h JWTs in `?token=` query strings (logs/history); no revocation on logout/offboarding. |
| S6 | `/auth/register` open to anyone reachable; no rate limiting on login/register. |
| S9-XSS | User-uploaded files served inline from same origin — confirm no stored-XSS path. |

---

## Task 2.1 — Default-deny access control (S1-cross)

Make "authenticated + deal-scoped" the default; routes opt *out* explicitly. A new route is secure by construction.

**Files:** modify `app/auth.py`, `app/main.py`, route modules; create `tests/test_default_deny.py`.

- [ ] **Step 1: Inventory + failing test.** Enumerate every route; write a test that walks `app.routes` and asserts each non-public route has an auth dependency (public allowlist: `/health`, `/auth/login`, `/auth/register`, `/landing` static). This test is the regression guard against future missed decorators.
- [ ] **Step 2: Router-level auth dependency.** Attach `Depends(get_current_user)` at router inclusion for all deal-scoped routers (`include_router(..., dependencies=[Depends(get_current_user)])`), keeping explicit `require_deal_access`/`require_admin` in handlers that need the row. Public routers mounted without it. This means a newly added handler is authenticated even if the author forgets.
- [ ] **Step 3:** Verify full suite + the walker test; commit — `feat(security): default-deny auth at the router layer`

## Task 2.2 — Audit logging (S4)

Append-only record of security-relevant actions: login, deal access, document view/upload/delete, run start, export.

**Files:** `app/database.py` (new `AuditLogRow`), new `app/services/audit_store.py`, `app/api/routes_audit.py` (admin-only read), hook into routes; `tests/test_audit_log.py`.

- [ ] **Step 1:** Schema — `AuditLogRow(id, user_id, action, resource_type, resource_id, deal_id, ip, user_agent, created_at, metadata_json)`. Append-only (no update/delete API).
- [ ] **Step 2:** `audit_store.record(...)`; a small FastAPI dependency or helper that route handlers call (or middleware for read-access on deal routes). Start with the high-value events: auth, document view/download, deal delete, doc delete, run start, export.
- [ ] **Step 3:** Admin-only `GET /audit?deal_id=&user_id=&since=` with pagination; CSV export for compliance handoff.
- [ ] **Step 4:** Tests — an audited action writes a row; the log has no mutation endpoints. Commit — `feat(security): append-only audit log for access + mutations`

## Task 2.3 — Token revocation + scoped download tokens (S5)

**Files:** `app/database.py` (`RevokedTokenRow` or a `jti` blocklist), `app/auth.py`, `app/api/routes_auth.py`, `app/api/routes_deals.py` (view endpoint); `tests/test_token_revocation.py`.

- [ ] **Step 1: JTI + revocation.** Add a `jti` (uuid) claim to every access token. Add `RevokedTokenRow(jti, expires_at)`; `decode_access_token` rejects a revoked jti. Add `POST /auth/logout` that revokes the current token. A periodic prune drops expired jtis.
- [ ] **Step 2: Scoped download tokens.** Replace the general-purpose `?token=` (24h JWT) on `/documents/{filename}/view` with a short-lived (≈5 min), single-purpose token minted per view request, scoped to `{deal_id, filename, action:"view"}`. `get_current_user_or_query_token` accepts only this scoped token on the query param, never a full session JWT.
- [ ] **Step 3:** Tests — revoked token → 401; expired scoped token → 401; scoped token can't be replayed for a different file. Commit — `feat(security): token revocation + short-lived scoped download tokens`

## Task 2.4 — Gate registration + rate limiting (S6)

**Files:** `app/api/routes_auth.py`, `app/config.py`, `requirements.txt` (per decision), `tests/test_auth_hardening.py`.

- [ ] **Step 1: Close open registration.** Options (pick one, default recommended): (a) **admin-only user creation** — move creation behind `require_admin`, remove public `/auth/register`, add `POST /users` admin route; (b) invite-token registration. Recommended: (a) for a closed institutional product. (SSO/SAML is the eventual answer — note it for a future plan.)
- [ ] **Step 2: Rate limiting.** Per the decision above, throttle `/auth/login` (and `/users` if kept) — e.g. N attempts / IP / minute → 429. Document single-process limitation.
- [ ] **Step 3:** Tests — public register gone (or invite-gated); Nth rapid login attempt → 429. Commit — `feat(security): admin-gated account creation + auth rate limiting`

## Task 2.5 — Inline-file XSS review (S9-XSS)

**Files:** review `app/api/routes_deals.py` view endpoint; `tests/test_inline_file_safety.py`.

- [ ] **Step 1:** Audit every inline-served path. The Excel→HTML path already escapes cells — confirm and lock it with a test (a cell containing `<script>` renders escaped). For other inline types (PDF/DOCX/txt/csv), add `Content-Security-Policy` and `X-Content-Type-Options: nosniff` headers, and confirm `content_disposition_type="inline"` is only used for types that can't execute script in the app origin (serve unknown/HTML-ish types as `attachment`).
- [ ] **Step 2:** Commit — `fix(security): harden inline document serving against stored XSS`

---

## Definition of done
- New tests pass, full `pytest -v` green, one commit per task.
- The default-deny walker test (2.1) is the durable guard — it fails if any future route forgets auth.

# Vyntic — agent guide

AI-native diligence workspace for private markets. Originally buyout-deal DD; now repositioning toward **LPs/allocators** (fund diligence + monitoring) — see `docs/todo/README.md` for the active roadmap. README.md has the full architecture; this file covers what you can't guess from reading it.

## Commands

```bash
# Full stack (backend :8000, frontend :3100, hot-reload dev :3200)
docker compose up --build -d

# Backend tests — CI runs bare `pytest` from backend/ (pythonpath=. in pytest.ini)
cd backend && .venv/bin/pytest -q

# Frontend typecheck + build (no test suite yet — see docs/todo F1)
cd frontend && npx tsc --noEmit && npm run build
```

- Local boot **requires real secrets** in `.env` (`JWT_SECRET_KEY`, `DEFAULT_ADMIN_PASSWORD`) or `ALLOW_INSECURE_DEFAULTS=true`; the app refuses to start otherwise (`assert_secure_secrets`).
- `backend/app` and `./data` are bind-mounted into the backend container — code changes need a container restart, not a rebuild; the SQLite DB/uploads live in `./data` and survive rebuilds.

## Invariants — do not break these

1. **`deal_id` is the universal workspace key.** Documents, workflows, runs, access rows, conversations, vector collections, and upload dirs all key off it. The LP object model (managers/funds/positions) layers *around* it — never rename or replace it. A "fund" is a `DealRow` with `entity_type="fund"`.
2. **Context isolation:** extraction context is always assembled per entity. The ONE deliberate relaxation is `scope="manager"` documents, shared across sibling funds of the same manager (`context_provider._manager_shared_doc_rows`). Nothing may ever cross a manager boundary; `tests/test_object_model.py::TestManagerSharedContext` guards this — extend it if you touch context assembly.
3. **Schema migrations are additive-only.** No Alembic. `database.py::_ensure_schema_migrations` applies `ALTER TABLE ADD COLUMN` for existing DBs; `create_all` handles new tables. Never write destructive DDL; SQLite can't add FK constraints via ALTER, so code must not rely on FK enforcement existing for shim-added columns (see `manager_store.delete_manager`).
4. **Built-in workflow templates reconcile on startup** (`workflow_seed.py`): edit prompts/labels freely in source and they propagate to existing DBs — but **column IDs must stay stable** or run history breaks.
5. **One LLM primitive:** every surface (chat, tabular cells, assistant stages, doc matrix, compare) answers through `extraction_engine.run_extraction`. Add capabilities there, not as parallel LLM call paths.
6. **Every claim needs a citation** back to page + snippet. No answers from model priors — this is the product's core promise to risk-averse allocators.

## Conventions

- **RBAC:** mutations are admin-only (`require_admin`); reads need `require_deal_access`. New routes are default-deny: copy the dependency pattern from `routes_deals.py`. Note `GET /deals` and `GET /managers` intentionally list all (access enforced at detail level).
- **Stores over ORM-in-routes:** routes call `*_store.py` functions that own their own sessions and return Pydantic models. Follow `deal_store.py`'s shape.
- **Full-context mode is the default** (`FULL_CONTEXT_MODE=true`): whole docs from `full_text_md`, no embeddings. The RAG path (ChromaDB) still exists behind the flag but does **not** get new features (e.g. manager-shared context) unless explicitly required.
- **Stage lists are entity-typed:** `DEAL_STAGES` vs `FUND_STAGES` in `models/deal.py`; validate with `stages_for_entity`.
- **Planning workflow:** substantial work gets a task-by-task plan in `docs/todo/` (indexed in its README); finished plans move to `docs/finished/`. Check the index before starting — the work may already be scoped, sequenced, or blocked on a decision.
- **Tests:** FastAPI `TestClient` + fixtures from `tests/conftest.py` (`client` = admin, `analyst_client` + `grant_analyst_access` for RBAC). Startup events don't run in tests — seed data via stores, not the app lifecycle.

## Gotchas

- Docling parsing runs in a subprocess with tight CPU/timeout defaults; large-PDF ingestion goes to background tasks (`INGEST_BACKGROUND_MIN_PAGES`). Don't block the event loop with parsing work.
- Two-tier Gemini fallback happens only **before the first token**; mid-stream failures error the cell for UI retry. Don't "fix" that by restarting answers mid-stream.
- `frontend-dev` container uses an anonymous volume for `node_modules` — after dependency changes, recreate with `--renew-anon-volumes` or you'll get `vite: not found` crash loops.
- The landing page (`components/landing/`) still sells the buyout story; product copy repositioning to LPs is intentional pending work, not drift to "fix" en passant.

"""Cost summary route: read access, default-deny for non-members."""
from app.agents.llm import LLMCallContext, LLMCallMeta
from app.services import llm_metrics


def _record(deal_id, surface="tabular_cell", run_id=None, prompt=100):
    llm_metrics.record_call(
        LLMCallMeta(
            model_used="m", prompt_tokens=prompt, completion_tokens=5, outcome="ok"
        ),
        LLMCallContext(surface=surface, deal_id=deal_id, run_id=run_id),
    )


def test_admin_reads_deal_cost(client):
    client.post("/deals", json={"name": "Fund A", "deal_id": "fund-a"})
    _record("fund-a", prompt=300)

    r = client.get("/deals/fund-a/cost")

    assert r.status_code == 200
    body = r.json()
    assert body["call_count"] == 1
    assert body["prompt_tokens"] == 300
    assert body["by_surface"] == {"tabular_cell": 305}  # tokens, not calls
    assert body["calls_by_surface"] == {"tabular_cell": 1}
    assert body["calls_by_outcome"] == {"ok": 1}


def test_run_id_filter(client):
    client.post("/deals", json={"name": "Fund A", "deal_id": "fund-a"})
    _record("fund-a", run_id="run-1", prompt=100)
    _record("fund-a", run_id="run-2", prompt=900)

    body = client.get("/deals/fund-a/cost?run_id=run-1").json()

    assert body["call_count"] == 1
    assert body["prompt_tokens"] == 100


def test_analyst_without_access_is_denied(client, analyst_client):
    client.post("/deals", json={"name": "Fund A", "deal_id": "fund-a"})
    _record("fund-a")

    r = analyst_client.get("/deals/fund-a/cost")

    assert r.status_code in (403, 404)


def test_unauthenticated_is_denied():
    from fastapi.testclient import TestClient
    from app.main import app

    r = TestClient(app).get("/deals/fund-a/cost")

    assert r.status_code == 401

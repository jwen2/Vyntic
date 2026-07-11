"""LP template seeding, entity scoping, and TVPI formula coverage."""

from app.database import SessionLocal, WorkflowRow
from app.models.deal import DealCreate
from app.models.manager import ManagerCreate
from app.services import deal_store, manager_store
from app.services.workflow_run_executor import _eval_formula
from app.services.workflow_seed import seed_builtin_workflows
from app.services.workflow_seed_lp import LP_BUILTIN_TEMPLATES, _TVPI_FORMULA


LP_IDS = {builtin_id for builtin_id, _ in LP_BUILTIN_TEMPLATES}


def _create_fund():
    manager_store.create_manager(ManagerCreate(manager_id="northstar", name="Northstar Capital"))
    return deal_store.create_deal(
        DealCreate(
            deal_id="northstar_v",
            name="Northstar Fund V",
            entity_type="fund",
            manager_id="northstar",
            stage="Diligence",
            vintage=2026,
            strategy="Buyout",
        )
    )


def test_seed_is_idempotent_and_has_21_entity_typed_builtins():
    seed_builtin_workflows()
    seed_builtin_workflows()

    db = SessionLocal()
    try:
        rows = db.query(WorkflowRow).filter(WorkflowRow.is_builtin.is_(True)).all()
        assert len(rows) == 21
        lp_rows = {row.id: row for row in rows if row.id in LP_IDS}
        assert set(lp_rows) == LP_IDS
        assert all(row.entity_type == "fund" for row in lp_rows.values())
        assert all(row.entity_type == "deal" for row in rows if row.id not in LP_IDS)
    finally:
        db.close()


def test_workspace_lists_only_matching_builtins_and_keeps_customs(client, sample_deal):
    _create_fund()
    seed_builtin_workflows()

    deal_workflows = client.get("/deals/test_deal/workflows")
    assert deal_workflows.status_code == 200
    assert len([w for w in deal_workflows.json() if w["is_builtin"]]) == 14
    assert {w["entity_type"] for w in deal_workflows.json()} == {"deal"}

    fund_workflows = client.get("/deals/northstar_v/workflows")
    assert fund_workflows.status_code == 200
    assert {w["id"] for w in fund_workflows.json() if w["is_builtin"]} == LP_IDS

    custom = client.post(
        "/deals/northstar_v/workflows",
        json={"name": "Custom monitor", "type": "tabular", "columns": []},
    )
    assert custom.status_code == 200
    assert custom.json()["entity_type"] == "fund"

    visible = client.get("/deals/northstar_v/workflows").json()
    assert custom.json()["id"] in {workflow["id"] for workflow in visible}


def test_track_record_reconciliation_formula_is_safe_and_evaluates():
    assert len(_TVPI_FORMULA) <= 200
    assert "**" not in _TVPI_FORMULA
    track_record = dict(LP_BUILTIN_TEMPLATES)["builtin_lp_track_record"]
    reconciliation = next(c for c in track_record.columns if c.label == "Reconciliation")
    assert reconciliation.is_derived is True
    assert reconciliation.formula == _TVPI_FORMULA

    assert _eval_formula(_TVPI_FORMULA, {"DPI": 0.7, "RVPI": 1.1, "TVPI": 1.8}) == "Ties out"
    assert _eval_formula(_TVPI_FORMULA, {"DPI": 0.7, "RVPI": 1.1, "TVPI": 1.6}).startswith("Mismatch")

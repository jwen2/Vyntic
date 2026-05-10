from app.models.workflow import WorkflowColumnInput, WorkflowCreate
from app.services import workflow_store
from app.services.workflow_format_migration import (
    canonical_format,
    migrate_workflow_formats,
    workflow_format_migration_plan,
)


def test_canonical_format_maps_legacy_values():
    assert canonical_format("text") == "prose"
    assert canonical_format("bulleted_list") == "list"
    assert canonical_format("number") == "metric"
    assert canonical_format("percentage") == "metric"
    assert canonical_format("monetary_amount") == "metric"
    assert canonical_format("currency") == "metric"
    assert canonical_format("yes_no") == "bool"
    assert canonical_format("tag") == "enum"
    assert canonical_format("date") == "date"
    assert canonical_format("prose") == "prose"
    assert canonical_format(None) == "prose"


def test_migration_dry_run_does_not_mutate_columns():
    workflow = workflow_store.create_workflow(
        deal_id=None,
        data=WorkflowCreate(
            name="Legacy workflow",
            type="tabular",
            columns=[
                WorkflowColumnInput(order_index=1, label="Summary", format="text"),
                WorkflowColumnInput(order_index=2, label="Flags", format="bulleted_list"),
                WorkflowColumnInput(order_index=3, label="Risk", format="enum"),
            ],
        ),
    )

    plan = workflow_format_migration_plan([workflow.id])
    assert [(item["column_label"], item["from_format"], item["to_format"]) for item in plan] == [
        ("Summary", "text", "prose"),
        ("Flags", "bulleted_list", "list"),
    ]

    result = migrate_workflow_formats(write=False, workflow_ids=[workflow.id])
    assert result["mode"] == "dry_run"
    assert result["changed_count"] == 2

    reloaded = workflow_store.get_workflow(workflow.id)
    assert reloaded is not None
    assert [column.format for column in reloaded.columns] == ["text", "bulleted_list", "enum"]


def test_migration_write_is_idempotent_and_preserves_tags():
    workflow = workflow_store.create_workflow(
        deal_id=None,
        data=WorkflowCreate(
            name="Tag workflow",
            type="tabular",
            columns=[
                WorkflowColumnInput(order_index=1, label="Amount", format="monetary_amount"),
                WorkflowColumnInput(order_index=2, label="Risk", format="tag", tags=["High", "Low"]),
            ],
        ),
    )

    result = migrate_workflow_formats(write=True, workflow_ids=[workflow.id])
    assert result["mode"] == "write"
    assert result["changed_count"] == 2

    reloaded = workflow_store.get_workflow(workflow.id)
    assert reloaded is not None
    assert [column.format for column in reloaded.columns] == ["metric", "enum"]
    assert reloaded.columns[1].tags == ["High", "Low"]

    second = migrate_workflow_formats(write=True, workflow_ids=[workflow.id])
    assert second["changed_count"] == 0

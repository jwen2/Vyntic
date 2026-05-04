"""Seed 8 built-in workflow templates idempotently on app startup.

Built-ins are deal_id=NULL (visible across all deals) and is_builtin=True.
We use deterministic IDs so re-seeding is a no-op once they exist.
"""
import logging

from app.database import SessionLocal, WorkflowRow
from app.models.workflow import (
    WorkflowCreate,
    WorkflowStageInput,
    WorkflowColumnInput,
)
from app.services import workflow_store

logger = logging.getLogger(__name__)


# ── Built-in 1: CIM → IC Memo Draft (assistant, 3 stages) ──
CIM_TO_MEMO = WorkflowCreate(
    name="CIM → IC Memo Draft",
    description="Multi-stage: extract thesis, risks, financials → compose memo",
    type="assistant",
    output_format="word",
    stages=[
        WorkflowStageInput(
            order_index=1,
            label="Extract Thesis & Business",
            prompt_md=(
                "You are a PE associate preparing the first cut of an IC memo. "
                "Read the Confidential Information Memorandum and any management presentations "
                "in the data room. Produce a structured outline with: (a) the company's core "
                "business model in 3 sentences, (b) the implicit investment thesis (why this "
                "company, why now), (c) 5–7 key business strengths, (d) 5–7 key risks or open "
                "questions. Cite every claim with [filename p.N]."
            ),
            checkpoint=True,
        ),
        WorkflowStageInput(
            order_index=2,
            label="Financial Diagnostic",
            prompt_md=(
                "Using the financials section of the CIM and any QofE / financial statements, "
                "produce: revenue and EBITDA trends (last 3Y + LTM), reported vs adjusted EBITDA "
                "with a clean adjustment bridge, gross margin trend, customer concentration, "
                "working capital trend, and disclosed debt/leverage. Flag any one-time items, "
                "owner add-backs, or unsupported pro-formas. Cite every figure."
            ),
            checkpoint=True,
        ),
        WorkflowStageInput(
            order_index=3,
            label="Compose IC Memo",
            prompt_md=(
                "Using the (possibly edited) outputs of Stages 1 and 2, compose an IC memo with "
                "these sections: Executive Summary, Investment Thesis, Business Overview, Market "
                "& Competition, Financial Performance, Management, Key Risks, Returns Analysis "
                "Placeholder, Recommended Next Steps. Keep prose tight; preserve all citations."
            ),
            checkpoint=False,
        ),
    ],
)


# ── Built-in 2: QofE Bridge (tabular, 8 cols) ──
QOFE_BRIDGE = WorkflowCreate(
    name="QofE Bridge",
    description="Reported → adjusted EBITDA with line-item adjustments",
    type="tabular",
    row_source="one_doc_per_row",
    output_format="excel",
    columns=[
        WorkflowColumnInput(
            order_index=1,
            label="Period",
            prompt="Identify the reporting period (e.g., FY2023, LTM Q3 2024).",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=2,
            label="Reported EBITDA",
            prompt="Extract reported EBITDA for the period. Cite the page and table.",
            format="monetary_amount",
        ),
        WorkflowColumnInput(
            order_index=3,
            label="Owner Compensation Adj.",
            prompt="Identify any owner compensation, bonus, or related-party expense above market that is being added back. Provide amount and rationale.",
            format="monetary_amount",
        ),
        WorkflowColumnInput(
            order_index=4,
            label="One-Time / Non-Recurring",
            prompt="Identify one-time items being added back (legal settlements, restructuring, COVID, M&A costs). List each with amount and short justification.",
            format="bulleted_list",
        ),
        WorkflowColumnInput(
            order_index=5,
            label="Run-Rate / Pro-Forma Adj.",
            prompt="Identify run-rate or pro-forma adjustments (annualizations, recently signed contracts, eliminated cost synergies). Flag aggressive ones.",
            format="bulleted_list",
        ),
        WorkflowColumnInput(
            order_index=6,
            label="Adjusted EBITDA",
            prompt="Extract management's adjusted EBITDA for the period.",
            format="monetary_amount",
        ),
        WorkflowColumnInput(
            order_index=7,
            label="Adjustment Quality",
            prompt="Classify the overall quality of adjustments based on documentation, recurrence, and reasonableness.",
            format="tag",
            tags=["High", "Medium", "Low", "Aggressive"],
        ),
        WorkflowColumnInput(
            order_index=8,
            label="Diligence Flags",
            prompt="List adjustments that require further diligence or that could be challenged by an IC member.",
            format="bulleted_list",
        ),
    ],
)


# ── Built-in 3: Contract Stack Review (tabular, 7 cols) ──
CONTRACT_STACK = WorkflowCreate(
    name="Contract Stack Review",
    description="Parties / term / CoC / exclusivity / MFN / auto-renew / termination",
    type="tabular",
    row_source="one_doc_per_row",
    output_format="excel",
    columns=[
        WorkflowColumnInput(
            order_index=1,
            label="Counterparty",
            prompt="Identify the contract counterparty and the company's role (customer, supplier, licensee, etc.).",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=2,
            label="Term",
            prompt="Extract initial term, renewal terms, and current expiration date if disclosed.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=3,
            label="Change of Control",
            prompt="Does this contract have a change-of-control provision? If yes, summarize whether it requires consent, allows termination, or triggers renegotiation.",
            format="yes_no",
        ),
        WorkflowColumnInput(
            order_index=4,
            label="Exclusivity / MFN",
            prompt="Identify any exclusivity, most-favored-nation, or non-compete obligations binding the company.",
            format="bulleted_list",
        ),
        WorkflowColumnInput(
            order_index=5,
            label="Auto-Renew",
            prompt="Does the contract auto-renew? If yes, what's the notice period to terminate?",
            format="yes_no",
        ),
        WorkflowColumnInput(
            order_index=6,
            label="Termination Rights",
            prompt="Summarize each party's termination rights — for cause, for convenience, with notice periods.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=7,
            label="Risk Tier",
            prompt="Assess overall deal risk from this contract considering CoC, exclusivity, auto-renewal, and termination.",
            format="tag",
            tags=["High", "Medium", "Low"],
        ),
    ],
)


# ── Built-in 4: Customer Concentration (tabular, 5 cols) ──
CUSTOMER_CONCENTRATION = WorkflowCreate(
    name="Customer Concentration",
    description="Top-N revenue %, contract status, churn flag",
    type="tabular",
    row_source="one_doc_per_row",
    output_format="excel",
    columns=[
        WorkflowColumnInput(
            order_index=1,
            label="Customer",
            prompt="Identify the customer name (or anonymized identifier).",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=2,
            label="Revenue %",
            prompt="Extract the customer's percentage of total revenue (most recent disclosed period).",
            format="percentage",
        ),
        WorkflowColumnInput(
            order_index=3,
            label="Relationship Length",
            prompt="How long has this customer been with the company? Extract years of relationship if disclosed.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=4,
            label="Contract Status",
            prompt="Is the customer under contract? If so, what is the term and renewal status? If on month-to-month, note the risk.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=5,
            label="Churn Risk",
            prompt="Assess churn risk based on contract status, length, satisfaction signals, and any disclosed concerns.",
            format="tag",
            tags=["High", "Medium", "Low", "Not Disclosed"],
        ),
    ],
)


# ── Built-in 5: Management Profiles (tabular, 6 cols) ──
MANAGEMENT_PROFILES = WorkflowCreate(
    name="Management Profiles",
    description="Execs × role / tenure / prior PE / equity rollover",
    type="tabular",
    row_source="one_doc_per_row",
    output_format="excel",
    columns=[
        WorkflowColumnInput(
            order_index=1,
            label="Executive",
            prompt="Identify the executive's name.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=2,
            label="Role",
            prompt="Current title and functional responsibilities.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=3,
            label="Tenure",
            prompt="Years in current role and total years with the company.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=4,
            label="Prior Experience",
            prompt="Summarize prior roles and companies, focusing on experience scaling businesses or working with PE.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=5,
            label="Prior PE Backed",
            prompt="Has this executive previously worked at a PE-backed company? Yes/No with a brief note.",
            format="yes_no",
        ),
        WorkflowColumnInput(
            order_index=6,
            label="Equity Rollover",
            prompt="Is the executive expected to roll equity into the new deal? Note % or amount if disclosed.",
            format="text",
        ),
    ],
)


# ── Built-in 6: Red Flag Scanner (assistant, 1 stage) ──
RED_FLAG_SCANNER = WorkflowCreate(
    name="Red Flag Scanner",
    description="Full data room scan, tagged by category + severity",
    type="assistant",
    output_format="markdown",
    stages=[
        WorkflowStageInput(
            order_index=1,
            label="Scan & Classify",
            prompt_md=(
                "You are a senior PE analyst doing a first-pass red flag scan across all deal "
                "documents. Identify investment-relevant red flags. For each flag, provide: "
                "(1) Category — one of [Financial, Commercial, Operational, Legal, Tax, IT/Cyber, "
                "ESG, Management]; (2) Severity — Deal-Breaker / Material / Noteworthy; (3) "
                "1-sentence headline; (4) 2–3 sentence detail with citations [filename p.N]; "
                "(5) Recommended diligence step. Group flags by category, sort by severity. "
                "Be skeptical: surface what management is downplaying or omitting."
            ),
            checkpoint=False,
        ),
    ],
)


# ── Built-in 7: Follow-up Q List (assistant, 1 stage) ──
FOLLOWUP_Q_LIST = WorkflowCreate(
    name="Follow-up Q List",
    description="Generate questions for next management meeting",
    type="assistant",
    output_format="markdown",
    stages=[
        WorkflowStageInput(
            order_index=1,
            label="Generate Questions",
            prompt_md=(
                "Generate a prioritized list of management Q&A questions for the next "
                "diligence call. Group by category (Commercial, Financial, Operational, "
                "Legal, Management). For each question: (a) the precise question, (b) why it "
                "matters (what hypothesis it tests), (c) the document or finding that prompted "
                "it [filename p.N]. Prioritize questions that would change the investment "
                "decision if answered unfavorably. Aim for 15–25 questions total."
            ),
            checkpoint=False,
        ),
    ],
)


# ── Built-in 8: Comp Set Builder (tabular, 10 cols) ──
COMP_SET = WorkflowCreate(
    name="Comp Set Builder",
    description="Uploaded docs + reference data → comparable set",
    type="tabular",
    row_source="one_doc_per_row",
    output_format="excel",
    columns=[
        WorkflowColumnInput(
            order_index=1,
            label="Company",
            prompt="Comparable company name.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=2,
            label="Sector",
            prompt="Sector / sub-sector.",
            format="text",
        ),
        WorkflowColumnInput(
            order_index=3,
            label="Revenue",
            prompt="Most recent annual revenue.",
            format="monetary_amount",
        ),
        WorkflowColumnInput(
            order_index=4,
            label="Revenue Growth",
            prompt="Most recent annual revenue growth rate.",
            format="percentage",
        ),
        WorkflowColumnInput(
            order_index=5,
            label="EBITDA",
            prompt="Most recent annual EBITDA.",
            format="monetary_amount",
        ),
        WorkflowColumnInput(
            order_index=6,
            label="EBITDA Margin",
            prompt="EBITDA margin for the period.",
            format="percentage",
        ),
        WorkflowColumnInput(
            order_index=7,
            label="EV / Revenue",
            prompt="Enterprise value to revenue multiple. Note as-of date.",
            format="number",
        ),
        WorkflowColumnInput(
            order_index=8,
            label="EV / EBITDA",
            prompt="Enterprise value to EBITDA multiple. Note as-of date.",
            format="number",
        ),
        WorkflowColumnInput(
            order_index=9,
            label="Comparability",
            prompt="How comparable is this company to the target on business model, scale, growth, and margin profile?",
            format="tag",
            tags=["Strong", "Moderate", "Weak"],
        ),
        WorkflowColumnInput(
            order_index=10,
            label="Notes",
            prompt="Brief notes on caveats, recent transactions, or context relevant to the multiple.",
            format="text",
        ),
    ],
)


# Stable IDs so re-seed is idempotent.
BUILTIN_TEMPLATES: list[tuple[str, WorkflowCreate]] = [
    ("builtin_cim_to_memo", CIM_TO_MEMO),
    ("builtin_qofe_bridge", QOFE_BRIDGE),
    ("builtin_contract_stack", CONTRACT_STACK),
    ("builtin_customer_concentration", CUSTOMER_CONCENTRATION),
    ("builtin_management_profiles", MANAGEMENT_PROFILES),
    ("builtin_red_flag_scanner", RED_FLAG_SCANNER),
    ("builtin_followup_q_list", FOLLOWUP_Q_LIST),
    ("builtin_comp_set", COMP_SET),
]


def seed_builtin_workflows():
    """Insert built-in workflow templates idempotently. Safe to call on every startup."""
    db = SessionLocal()
    try:
        existing_ids = {row.id for row in db.query(WorkflowRow.id).filter(WorkflowRow.is_builtin.is_(True)).all()}
    finally:
        db.close()

    for builtin_id, payload in BUILTIN_TEMPLATES:
        if builtin_id in existing_ids:
            continue
        workflow_store.create_workflow(
            deal_id=None,
            data=payload,
            created_by=None,
            is_builtin=True,
            workflow_id=builtin_id,
        )
        logger.info("Seeded built-in workflow: %s (%s)", payload.name, builtin_id)

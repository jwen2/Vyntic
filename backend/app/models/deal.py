from pydantic import BaseModel


# Buyout deal pipeline (entity_type="deal").
DEAL_STAGES = ["Screening", "Due Diligence", "IC Review", "Closed"]

# LP fund lifecycle (entity_type="fund"). Diligence stages mirror the deal
# pipeline; Committed onward is the post-commitment monitoring life.
FUND_STAGES = ["Screening", "Diligence", "IC", "Committed", "Monitoring", "Re-up review"]

ENTITY_TYPES = ["deal", "fund"]

SECTOR_TAGS = [
    "Technology", "Healthcare", "Industrials", "Consumer",
    "Financial Services", "Energy", "Real Estate", "Infrastructure",
]

# LP document taxonomy. Powers template pre-selection and the future
# monitoring inbox; "other" is the safe default for unclassified uploads.
DOC_CATEGORIES = [
    "ddq",
    "ppm",
    "lpa",
    "side_letter",
    "track_record",
    "pitchbook",
    "quarterly_report",
    "capital_account",
    "capital_call",
    "distribution_notice",
    "financial_statements",
    "form_adv",
    "valuation_policy",
    "other",
]

DOC_SCOPES = ["entity", "manager"]


def stages_for_entity(entity_type: str) -> list[str]:
    return FUND_STAGES if entity_type == "fund" else DEAL_STAGES


class Deal(BaseModel):
    deal_id: str
    name: str
    description: str = ""
    document_count: int = 0
    stage: str = "Screening"
    tags: list[str] = []
    entity_type: str = "deal"
    manager_id: str | None = None
    manager_name: str | None = None
    vintage: int | None = None
    strategy: str = ""


class DealCreate(BaseModel):
    deal_id: str
    name: str
    description: str = ""
    stage: str = "Screening"
    tags: list[str] = []
    entity_type: str = "deal"
    manager_id: str | None = None
    vintage: int | None = None
    strategy: str = ""


class DealUpdate(BaseModel):
    """Partial update — only provided fields are changed."""
    name: str | None = None
    description: str | None = None
    stage: str | None = None
    tags: list[str] | None = None
    manager_id: str | None = None
    vintage: int | None = None
    strategy: str | None = None

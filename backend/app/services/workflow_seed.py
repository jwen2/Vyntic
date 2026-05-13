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


# ─────────────────────────────────────────────────────────────────────────────
# DD workstream packs migrated from the legacy Workstreams tab (2026-05-12).
# Each is a tabular workflow with row_source="multi_doc_synthesis", which means
# every column runs against the full deal corpus. The runs endpoint defaults
# the single synthesis-row label to the workflow name, so these execute
# one-click. Question prompts are preserved verbatim from queryTemplates.ts.
# ─────────────────────────────────────────────────────────────────────────────

# ── Built-in 9: Financial DD (tabular synthesis, 15 cols) ──
FINANCIAL_DD = WorkflowCreate(
    name="Financial DD",
    description="Revenue quality, margins, working capital, debt, and capital structure",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1,  label="Revenue breakdown",
            prompt="What is the revenue breakdown by segment, product, or geography? Include growth rates for each.",
            format="prose"),
        WorkflowColumnInput(order_index=2,  label="EBITDA & margins",
            prompt="What is the EBITDA and what are the key margin trends over the available periods? Distinguish adjusted vs. unadjusted.",
            format="prose"),
        WorkflowColumnInput(order_index=3,  label="Revenue growth trajectory",
            prompt="What is the historical revenue growth rate? Is growth accelerating or decelerating? Show the trend over all available periods.",
            format="prose"),
        WorkflowColumnInput(order_index=4,  label="EBITDA bridge / adjustments",
            prompt="What are the EBITDA adjustments and add-backs? List each adjustment with its dollar amount and rationale. What is the gap between reported and adjusted EBITDA?",
            format="list"),
        WorkflowColumnInput(order_index=5,  label="Gross margin analysis",
            prompt="What is the gross margin profile and how has it trended? Identify the key drivers of gross margin expansion or compression.",
            format="prose"),
        WorkflowColumnInput(order_index=6,  label="Revenue quality: recurring vs. non-recurring",
            prompt="What portion of revenue is recurring vs. non-recurring? Is there evidence of revenue quality issues such as one-time contracts, channel stuffing, or pull-forward effects?",
            format="prose"),
        WorkflowColumnInput(order_index=7,  label="Working capital",
            prompt="What is the working capital profile? Include days sales outstanding (DSO), days inventory outstanding (DIO), days payables outstanding (DPO), and the cash conversion cycle.",
            format="kv"),
        WorkflowColumnInput(order_index=8,  label="Capital expenditures",
            prompt="What are the capital expenditure levels (maintenance vs. growth capex) and how do they trend relative to revenue?",
            format="prose"),
        WorkflowColumnInput(order_index=9,  label="Debt & capital structure",
            prompt="What is the current debt structure? Include total debt, net debt, leverage ratios (Net Debt/EBITDA), interest coverage, and maturity schedule.",
            format="kv"),
        WorkflowColumnInput(order_index=10, label="Cash flow analysis",
            prompt="What is the free cash flow profile? Show operating cash flow, capex, and FCF conversion rate. Are there any unusual cash flow items?",
            format="prose"),
        WorkflowColumnInput(order_index=11, label="Revenue cohort analysis",
            prompt="Is there cohort-level revenue data available? Show how different customer cohorts or vintage years have performed over time.",
            format="prose"),
        WorkflowColumnInput(order_index=12, label="Unit economics",
            prompt="What are the unit economics? Include customer acquisition cost (CAC), lifetime value (LTV), LTV/CAC ratio, and payback period if available.",
            format="kv"),
        WorkflowColumnInput(order_index=13, label="Seasonality & cyclicality",
            prompt="Is there evidence of seasonality or cyclicality in the business? Show quarterly or monthly revenue patterns if available.",
            format="prose"),
        WorkflowColumnInput(order_index=14, label="Tax structure",
            prompt="What is the effective tax rate and are there any notable tax attributes (NOLs, tax credits, transfer pricing arrangements)?",
            format="prose"),
        WorkflowColumnInput(order_index=15, label="Historical & projected financials",
            prompt="Summarize the historical and projected financial performance. Show revenue, EBITDA, and margins for all available historical and forecast periods.",
            format="prose"),
    ],
)


# ── Built-in 10: Commercial DD (tabular synthesis, 13 cols) ──
COMMERCIAL_DD = WorkflowCreate(
    name="Commercial DD",
    description="Market sizing, competitive landscape, customer analysis, and pricing",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1,  label="Market size & TAM",
            prompt="What is the total addressable market (TAM), serviceable addressable market (SAM), and serviceable obtainable market (SOM)? What is the expected market growth rate?",
            format="kv"),
        WorkflowColumnInput(order_index=2,  label="Competitive landscape",
            prompt="What is the competitive landscape? Who are the main competitors, their relative market shares, and key differentiators?",
            format="prose"),
        WorkflowColumnInput(order_index=3,  label="Customer concentration",
            prompt="What is the customer concentration? What percentage of revenue comes from the top 5, top 10, and top 20 customers? Have any major customers been lost recently?",
            format="prose"),
        WorkflowColumnInput(order_index=4,  label="Customer retention & churn",
            prompt="What are the customer retention and churn metrics? Include gross retention, net revenue retention (NRR), logo churn, and dollar churn if available.",
            format="kv"),
        WorkflowColumnInput(order_index=5,  label="Pricing power & strategy",
            prompt="Is there evidence of pricing power? What is the pricing model, history of price increases, and customer response to price changes?",
            format="prose"),
        WorkflowColumnInput(order_index=6,  label="Sales pipeline & backlog",
            prompt="What is the sales pipeline, backlog, or order book? What is the conversion rate from pipeline to closed deals?",
            format="prose"),
        WorkflowColumnInput(order_index=7,  label="Go-to-market strategy",
            prompt="What is the go-to-market strategy? Describe the sales channels, sales cycle length, and customer acquisition approach.",
            format="prose"),
        WorkflowColumnInput(order_index=8,  label="End-market diversification",
            prompt="How diversified is the customer base across end-markets, verticals, or industries? Is there over-reliance on any single end-market?",
            format="prose"),
        WorkflowColumnInput(order_index=9,  label="Contract structure",
            prompt="What is the typical contract structure? Include contract duration, auto-renewal terms, termination provisions, and switching costs.",
            format="prose"),
        WorkflowColumnInput(order_index=10, label="Growth drivers",
            prompt="What are the primary organic growth drivers? What new products, markets, or expansion initiatives are planned or underway?",
            format="list"),
        WorkflowColumnInput(order_index=11, label="Win/loss analysis",
            prompt="Is there win/loss data available? What are the primary reasons for winning and losing deals against competitors?",
            format="prose"),
        WorkflowColumnInput(order_index=12, label="Customer satisfaction",
            prompt="What customer satisfaction data is available? Include NPS scores, customer surveys, or qualitative feedback if present.",
            format="prose"),
        WorkflowColumnInput(order_index=13, label="Geographic footprint",
            prompt="What is the geographic footprint? Show revenue by region and identify expansion opportunities or geographic risks.",
            format="prose"),
    ],
)


# ── Built-in 11: Operational DD (tabular synthesis, 13 cols) ──
OPERATIONAL_DD = WorkflowCreate(
    name="Operational DD",
    description="Management team, org structure, technology, and vendor dependencies",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1,  label="Management team assessment",
            prompt="Who are the key members of the management team? What is their tenure, background, and track record? Are there any gaps in the leadership team?",
            format="prose"),
        WorkflowColumnInput(order_index=2,  label="Key person risk",
            prompt="Is there key person dependency? Which individuals are critical to operations and what would happen if they departed?",
            format="prose"),
        WorkflowColumnInput(order_index=3,  label="Organizational structure",
            prompt="What is the organizational structure? How many employees by function (sales, engineering, operations, G&A)? What is the employee growth trend?",
            format="kv"),
        WorkflowColumnInput(order_index=4,  label="Employee retention & culture",
            prompt="What are the employee retention metrics? Include turnover rates, tenure data, and any indicators of cultural health (Glassdoor ratings, employee surveys).",
            format="prose"),
        WorkflowColumnInput(order_index=5,  label="Technology & IT systems",
            prompt="What technology stack and IT systems are in place? Are there any legacy system risks, technical debt, or planned migrations?",
            format="prose"),
        WorkflowColumnInput(order_index=6,  label="Vendor & supplier dependencies",
            prompt="What are the key vendor and supplier relationships? Is there concentration risk with any single supplier? What are the contract terms?",
            format="prose"),
        WorkflowColumnInput(order_index=7,  label="Operational efficiency & KPIs",
            prompt="What are the key operational KPIs and efficiency metrics? How do they compare to industry benchmarks?",
            format="prose"),
        WorkflowColumnInput(order_index=8,  label="Scalability assessment",
            prompt="How scalable is the current operating model? What investments (people, systems, infrastructure) would be needed to support 2-3x growth?",
            format="prose"),
        WorkflowColumnInput(order_index=9,  label="Facilities & real estate",
            prompt="What is the facilities footprint? Include lease terms, capacity utilization, and any planned expansions or consolidations.",
            format="prose"),
        WorkflowColumnInput(order_index=10, label="Supply chain & logistics",
            prompt="What does the supply chain look like? Identify any single points of failure, lead time risks, or geographic concentration.",
            format="prose"),
        WorkflowColumnInput(order_index=11, label="Insurance coverage",
            prompt="What insurance coverage is in place? Are there any gaps in coverage or notable claims history?",
            format="prose"),
        WorkflowColumnInput(order_index=12, label="ESG & sustainability",
            prompt="What is the company's ESG (Environmental, Social, Governance) profile? Are there any environmental liabilities or sustainability initiatives?",
            format="prose"),
        WorkflowColumnInput(order_index=13, label="Value creation opportunities",
            prompt="What are the key value creation levers — pricing optimization, cost reduction, operational improvements, add-on M&A, or technology-driven efficiencies?",
            format="list"),
    ],
)


# ── Built-in 12: Legal DD (tabular synthesis, 12 cols) ──
LEGAL_DD = WorkflowCreate(
    name="Legal DD",
    description="Litigation, contracts, intellectual property, and regulatory compliance",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1,  label="Pending litigation",
            prompt="Are there any pending litigation matters, threatened claims, or material disputes? What is the estimated exposure and likelihood of adverse outcomes?",
            format="prose"),
        WorkflowColumnInput(order_index=2,  label="Contingent liabilities",
            prompt="Are there any contingent liabilities, off-balance-sheet obligations, or guarantees that could create future financial exposure?",
            format="prose"),
        WorkflowColumnInput(order_index=3,  label="Regulatory compliance",
            prompt="What is the regulatory environment? Are there any compliance gaps, pending regulatory actions, or upcoming regulation changes that could impact the business?",
            format="prose"),
        WorkflowColumnInput(order_index=4,  label="Intellectual property",
            prompt="What intellectual property does the company own (patents, trademarks, trade secrets, copyrights)? Are there any IP disputes or licensing risks?",
            format="prose"),
        WorkflowColumnInput(order_index=5,  label="Material contracts review",
            prompt="What are the most material contracts? Identify any change-of-control provisions, exclusivity clauses, or unfavorable terms that could impact a transaction.",
            format="prose"),
        WorkflowColumnInput(order_index=6,  label="Employment & labor",
            prompt="Are there any employment-related risks — pending labor disputes, union relationships, non-compete enforceability, or benefits obligations?",
            format="prose"),
        WorkflowColumnInput(order_index=7,  label="Data privacy & cybersecurity",
            prompt="What is the company's data privacy and cybersecurity posture? Are there any past data breaches, GDPR/CCPA compliance issues, or pending investigations?",
            format="prose"),
        WorkflowColumnInput(order_index=8,  label="Environmental liabilities",
            prompt="Are there any environmental liabilities, remediation obligations, or pending environmental investigations?",
            format="prose"),
        WorkflowColumnInput(order_index=9,  label="Tax compliance & risks",
            prompt="Are there any open tax audits, transfer pricing risks, or potential tax liabilities? Are all tax filings current?",
            format="prose"),
        WorkflowColumnInput(order_index=10, label="Corporate governance",
            prompt="What is the corporate governance structure? Review board composition, voting rights, minority protections, and any related-party transactions.",
            format="prose"),
        WorkflowColumnInput(order_index=11, label="Permits & licenses",
            prompt="What permits, licenses, and approvals are required to operate? Are all current? Are there any at risk of non-renewal?",
            format="prose"),
        WorkflowColumnInput(order_index=12, label="Anti-bribery & FCPA",
            prompt="Is there any exposure to anti-bribery or FCPA risks? Are there adequate compliance programs in place for international operations?",
            format="prose"),
    ],
)


# ── Built-in 13: Risk Scorecard (tabular synthesis, 9 cols, enum-shape scores) ──
_RISK_TAGS = ["1 (Low)", "2", "3 (Medium)", "4", "5 (Critical)"]

RISK_SCORECARD = WorkflowCreate(
    name="Risk Scorecard",
    description="Automated risk scoring across key dimensions with 1-5 scale and red/yellow/green indicators",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1, label="Revenue quality risk",
            prompt="Assess the REVENUE QUALITY risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: recurring vs. non-recurring mix, customer concentration, revenue volatility, and sustainability. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=2, label="Customer concentration risk",
            prompt="Assess the CUSTOMER CONCENTRATION risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: top customer revenue share, customer diversification, contract stability, and churn risk. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=3, label="Management & key person risk",
            prompt="Assess the MANAGEMENT & KEY PERSON risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: leadership depth, key person dependencies, succession planning, tenure, and track record. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=4, label="Margin sustainability risk",
            prompt="Assess the MARGIN SUSTAINABILITY risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: gross margin trends, cost structure, pricing power, input cost exposure, and competitive pressure on margins. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=5, label="Regulatory & compliance risk",
            prompt="Assess the REGULATORY & COMPLIANCE risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: regulatory environment, pending enforcement actions, compliance gaps, licensing requirements, and upcoming regulation changes. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=6, label="Litigation risk",
            prompt="Assess the LITIGATION risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: pending lawsuits, historical claims, contingent liabilities, and potential exposure amounts. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=7, label="Capital intensity risk",
            prompt="Assess the CAPITAL INTENSITY risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: capex requirements, maintenance vs. growth capex, asset-heavy vs. asset-light model, and free cash flow conversion. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=8, label="Technology & obsolescence risk",
            prompt="Assess the TECHNOLOGY & OBSOLESCENCE risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: technical debt, legacy system dependencies, competitive tech landscape, and R&D investment adequacy. Return a single token from {1 (Low), 2, 3 (Medium), 4, 5 (Critical)}. Follow it with a one-sentence justification and the top 2-3 supporting data points from the documents.",
            format="enum", tags=_RISK_TAGS),
        WorkflowColumnInput(order_index=9, label="Overall risk summary",
            prompt="Provide an EXECUTIVE RISK SUMMARY. Synthesize all risk dimensions (revenue quality, customer concentration, management depth, margin sustainability, regulatory exposure, litigation, capital intensity, technology) into a one-page assessment. For each dimension, assign Low/Medium/High with a traffic-light color (Green/Yellow/Red). End with an overall risk rating and the top 3 risks that require immediate attention.",
            format="prose"),
    ],
)


# ── Built-in 14: Proactive Scan (tabular synthesis, 11 cols) ──
PROACTIVE_SCAN = WorkflowCreate(
    name="Proactive Scan",
    description="AI-powered sweep of the full deal room to find hidden risks, buried clauses, and items you might miss",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1,  label="Deal snapshot",
            prompt="Create a concise DEAL SNAPSHOT from the full VDR. Use this exact field format with one field per line where evidence exists, and write \"Not found\" when the VDR does not support the field: Target: [company name]\nCompany: [one-sentence description]\nSector: [sector/subsector]\nBusiness model: [how the company makes money]\nGeography: [HQ and operating footprint]\nSeller: [seller/sponsor/advisor if disclosed]\nStage: [process stage or document date context]. Include [Source N] citations for the most important fields.",
            format="kv"),
        WorkflowColumnInput(order_index=2,  label="Proposed transaction",
            prompt="Extract WHAT IS BEING PROPOSED in this deal from the full VDR. Use this exact field format with one field per line where evidence exists, and write \"Not found\" when the VDR does not support the field: Transaction type: [platform acquisition/add-on/minority investment/recap/carve-out/etc.]\nPurchase price: [amount if disclosed]\nEnterprise value: [amount if disclosed]\nOwnership: [stake or control position]\nValuation: [EV/Revenue, EV/EBITDA, ARR multiple, or other disclosed multiple]\nFinancing: [debt/equity assumptions if disclosed]\nTiming: [LOI, exclusivity, bid process, close timing, or key dates]. Include [Source N] citations for the most important fields.",
            format="kv"),
        WorkflowColumnInput(order_index=3,  label="Key financial highlights",
            prompt="Extract ALL KEY FINANCIAL DATA from the VDR that a PE analyst would want in a first-pass deal brief. If an income statement, QoE table, financial model, or monthly/quarterly financials are available, present the financials in Yahoo Finance style markdown tables: first an \"Annual Financials\" table with rows for Revenue, Gross Profit/Gross Margin, EBITDA, Adjusted EBITDA, EBITDA Margin, Net Income if available, Capex, Free Cash Flow, Net Debt/Cash, and other relevant metrics; then a \"Quarterly Financials\" table for available quarters using the same row style. Include [Source N] citations in the relevant table cells or row labels. Do not invent unavailable metrics; write \"Not found\" in table cells when a critical metric is missing.",
            format="prose"),
        WorkflowColumnInput(order_index=4,  label="Investment thesis",
            prompt="Synthesize the INVESTMENT THESIS for this deal grounded only in the VDR. Use these exact section headings on their own lines, each followed by 3-5 short bullet points starting with \"- \". Keep each bullet to one sentence and include [Source N] citations where the VDR supports the claim:\nThesis: [why this is an attractive acquisition — market position, growth, durable economics]\nValue creation levers: [pricing, cost takeout, M&A roll-up, ops improvements, channel/geo expansion]\nExit considerations: [likely exit paths, comparable multiples or buyer universe, time-to-exit assumptions]\nRisks to thesis: [key risks that could break the thesis — concentration, regulatory, key-person, cyclicality]\nIf a section has no support in the VDR, write a single bullet \"- Not found\" under that heading. Do not invent claims.",
            format="prose"),
        WorkflowColumnInput(order_index=5,  label="Analyst next actions",
            prompt="Based on the full VDR, propose the top 5 NEXT DILIGENCE ACTIONS for a PE analyst. Focus on practical asks: documents to request, numbers to reconcile, customer/management questions to ask, legal provisions to review, and model sensitivities to run. Each action should be one sentence and cite the source or gap that motivated it where possible using [Source N].",
            format="list"),
        WorkflowColumnInput(order_index=6,  label="Hidden financial risks",
            prompt="Scan these deal documents for HIDDEN FINANCIAL RISKS that a deal team might overlook. Focus on: unusual EBITDA adjustments or add-backs that inflate profitability, one-time items presented as recurring, aggressive revenue recognition, off-balance-sheet obligations, related-party transactions, working capital anomalies, or any financial metrics qualified by footnotes or caveats that weaken the headline numbers. List each finding with its severity.",
            format="list"),
        WorkflowColumnInput(order_index=7,  label="Buried contractual & legal risks",
            prompt="Scan these deal documents for BURIED CONTRACTUAL AND LEGAL RISKS. Focus on: change-of-control provisions that could trigger penalties or contract terminations upon acquisition, exclusivity clauses limiting future growth, unfavorable termination terms, non-compete restrictions on key personnel, pending or threatened litigation minimized in presentations, contingent liabilities, indemnification caps, and any contractual terms creating asymmetric downside for the buyer.",
            format="list"),
        WorkflowColumnInput(order_index=8,  label="Operational vulnerabilities",
            prompt="Scan these deal documents for OPERATIONAL VULNERABILITIES that could impact the investment thesis. Focus on: key person dependencies without succession plans, vendor or supplier concentration risks, customer concentration downplayed in the CIM, technology debt or system limitations, capacity constraints, talent retention risks, and any operational metrics trending in the wrong direction that aren't prominently highlighted.",
            format="list"),
        WorkflowColumnInput(order_index=9,  label="Data room gaps & omissions",
            prompt="Analyze what is CONSPICUOUSLY ABSENT from these deal documents. Based on standard PE due diligence requirements, identify: missing document types (e.g., no QoE report, no environmental assessment, no customer contracts), referenced but unprovided data (reports mentioned but not included), incomplete disclosures, time periods with gaps in financial data, and any areas where the documents raise questions that the existing materials don't answer.",
            format="list"),
        WorkflowColumnInput(order_index=10, label="Cross-document inconsistencies",
            prompt="CROSS-REFERENCE claims, metrics, and narratives across all documents in this deal room. Identify: revenue or EBITDA figures that don't match between documents, growth projections that differ between the CIM and financial models, risk factors described inconsistently, headcount or operational metrics that conflict, and any narrative in one document that contradicts or undermines claims made in another.",
            format="list"),
        WorkflowColumnInput(order_index=11, label="Regulatory & compliance exposure",
            prompt="Scan these deal documents for REGULATORY AND COMPLIANCE EXPOSURE. Focus on: pending regulatory actions or investigations, data privacy and cybersecurity risks (GDPR, CCPA), environmental liabilities or remediation obligations, anti-bribery/FCPA concerns for international operations, license or permit vulnerabilities, upcoming regulation changes that could impact the business model, and any compliance items buried in appendices or risk factor sections.",
            format="list"),
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
    ("builtin_financial_dd", FINANCIAL_DD),
    ("builtin_commercial_dd", COMMERCIAL_DD),
    ("builtin_operational_dd", OPERATIONAL_DD),
    ("builtin_legal_dd", LEGAL_DD),
    ("builtin_risk_scorecard", RISK_SCORECARD),
    ("builtin_proactive_scan", PROACTIVE_SCAN),
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

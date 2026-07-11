"""LP-native built-in workflow templates for fund workspaces."""

from app.models.workflow import WorkflowColumnInput, WorkflowCreate, WorkflowStageInput


_ODD_TAGS = ["Clean", "Monitor", "Red flag"]
_ALIGN_TAGS = ["LP-favorable", "Market", "GP-favorable", "Silent"]
_TVPI_FORMULA = '=IF([DPI]+[RVPI]-[TVPI]>0.05,"Mismatch: DPI+RVPI != TVPI",IF([TVPI]-[DPI]-[RVPI]>0.05,"Mismatch: DPI+RVPI != TVPI","Ties out"))'


def _ddq_column(order_index: int, label: str) -> WorkflowColumnInput:
    return WorkflowColumnInput(
        order_index=order_index,
        label=label,
        format="markdown",
        prompt=(
            f"Review the {label.upper()} section across the DDQ and supporting materials. "
            "Summarize the answers, flag skipped or evasive responses, identify contradictions "
            "with the PPM or pitchbook, and propose focused follow-up questions. Include [Source N] "
            'citations for every supported claim; write "Not found" when the documents do not cover the section.'
        ),
    )


LP_DDQ_SCAN = WorkflowCreate(
    name="DDQ Gap & Consistency Scan",
    description="ILPA DDQ coverage, evasions, contradictions, and follow-up questions",
    entity_type="fund",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        _ddq_column(1, "Firm & Ownership"),
        _ddq_column(2, "Team & Succession"),
        _ddq_column(3, "Track Record"),
        _ddq_column(4, "Investment Strategy & Process"),
        _ddq_column(5, "Fund Terms & Economics"),
        _ddq_column(6, "Valuation Policy"),
        _ddq_column(7, "Compliance & Regulatory"),
        _ddq_column(8, "IT & Cybersecurity"),
        _ddq_column(9, "ESG"),
        _ddq_column(10, "LP Base & References"),
        _ddq_column(11, "Conflicts of Interest"),
        _ddq_column(12, "Service Providers"),
    ],
)


LP_TRACK_RECORD = WorkflowCreate(
    name="Track Record Grid",
    description="Fund-level performance extraction with TVPI reconciliation",
    entity_type="fund",
    type="tabular",
    row_source="one_doc_per_row",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1, label="Fund name", format="text", prompt='Extract the FUND NAME. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=2, label="Vintage", format="text", prompt='Extract the VINTAGE YEAR, e.g. 2018. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=3, label="Fund size", format="monetary_amount", prompt='Extract total FUND SIZE with currency. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=4, label="Net IRR", format="percentage", prompt='Extract NET IRR only, not gross IRR. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=5, label="TVPI", format="metric", prompt='Extract TVPI. Return the numeric multiple only, e.g. 1.85. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=6, label="DPI", format="metric", prompt='Extract DPI. Return the numeric multiple only, e.g. 1.85. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=7, label="RVPI", format="metric", prompt='Extract RVPI. Return the numeric multiple only, e.g. 1.85. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=8, label="Loss ratio", format="percentage", prompt='Extract or calculate the LOSS RATIO: percent of invested capital in deals returning below 1.0x. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=9, label="Realized vs unrealized", format="kv", prompt='Summarize the REALIZED VS UNREALIZED performance mix. Use exactly: Realized: [desc]\nUnrealized: [desc]. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=10, label="Restatement & footnote flags", format="bulleted_list", prompt='Flag RESTATEMENTS AND FOOTNOTE RISKS: recycled capital, gross-vs-net presentation, cherry-picked subsets, and missing funds. Include [Source N] citations; write "Not found" if none are supported.'),
        WorkflowColumnInput(order_index=11, label="Reconciliation", format="text", prompt="Derived check of whether TVPI equals DPI plus RVPI.", is_derived=True, formula=_TVPI_FORMULA),
    ],
)


LP_FUND_TERMS = WorkflowCreate(
    name="Fund Terms Extractor",
    description="PPM and LPA economics, governance, and off-market terms",
    entity_type="fund",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1, label="Management fee", format="markdown", prompt='Extract the MANAGEMENT FEE basis, rate, and every step-down. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=2, label="Carried interest", format="percentage", prompt='Extract the CARRIED INTEREST percentage. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=3, label="Preferred return", format="percentage", prompt='Extract the PREFERRED RETURN or hurdle percentage. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=4, label="Waterfall type", format="enum", tags=["European", "American", "Hybrid", "Not disclosed"], prompt="Classify the WATERFALL. Return a single token from {European, American, Hybrid, Not disclosed}, followed by one sentence of justification and a [Source N] citation."),
        WorkflowColumnInput(order_index=5, label="GP commitment", format="markdown", prompt='Extract GP COMMITMENT percentage and whether funded in cash or by fee waiver. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=6, label="Key-person provision", format="markdown", prompt='Extract the KEY-PERSON clause: short quote, section number, trigger, suspension, and consequences. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=7, label="Term & extensions", format="markdown", prompt='Extract FUND TERM and extension count, duration, and approval mechanics. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=8, label="Fee offsets", format="markdown", prompt='Extract FEE OFFSETS, including the percent of monitoring, transaction, and affiliate fees offset. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=9, label="Recycling", format="markdown", prompt='Extract RECYCLING rights, limits, eligible proceeds, and time window. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=10, label="Removal & no-fault divorce", format="markdown", prompt='Extract GP REMOVAL AND NO-FAULT DIVORCE thresholds, causes, votes, and consequences. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=11, label="Organizational expense cap", format="monetary_amount", prompt='Extract the ORGANIZATIONAL EXPENSE CAP with currency. Include a [Source N] citation; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=12, label="Off-market terms summary", format="bulleted_list", prompt='Flag LP-UNFAVORABLE OFF-MARKET TERMS versus institutional norms, including below-100% fee offsets or deal-by-deal carry without clawback escrow. Include [Source N] citations; write "Not found" if none are supported.'),
    ],
)


LP_ODD_SCREEN = WorkflowCreate(
    name="ODD Screen",
    description="Operational due diligence across governance, providers, compliance, and GP health",
    entity_type="fund",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1, label="Valuation governance", format="markdown", prompt='Assess VALUATION GOVERNANCE: who marks assets, committee independence, and auditor scrutiny of Level 3 values. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=2, label="Service providers", format="kv", prompt='List SERVICE PROVIDERS using exactly: Auditor: [desc]\nAdministrator: [desc]\nCustodian: [desc]\nFund counsel: [desc]\nPrime broker: [desc]. Flag unknown or non-institutional providers. Include [Source N] citations; write "Not found" for missing fields.'),
        WorkflowColumnInput(order_index=3, label="Regulatory & litigation history", format="markdown", prompt='Assess REGULATORY AND LITIGATION HISTORY, including Form ADV disclosures, investigations, and sanctions. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=4, label="Cybersecurity & BCP", format="markdown", prompt='Assess CYBERSECURITY AND BUSINESS CONTINUITY controls, testing, incidents, recovery objectives, and vendors. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=5, label="Compliance program", format="markdown", prompt='Assess the COMPLIANCE PROGRAM: CCO independence, personal trading, testing, and expense allocation. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=6, label="Conflicts of interest", format="markdown", prompt='Assess CONFLICTS OF INTEREST: related-party transactions, cross-fund allocation, and affiliate fee streams. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=7, label="Financial health of the GP", format="markdown", prompt='Assess GP FINANCIAL HEALTH, revenue concentration, balance-sheet support, insurance, and continuity risks. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=8, label="Overall ODD rating", format="enum", tags=_ODD_TAGS, prompt="Rate OVERALL ODD. Return a single token from {Clean, Monitor, Red flag}, followed by one sentence of justification and the top supporting [Source N] citations."),
    ],
)


def _alignment_column(order_index: int, label: str, focus: str) -> WorkflowColumnInput:
    return WorkflowColumnInput(
        order_index=order_index,
        label=label,
        format="markdown",
        tags=_ALIGN_TAGS,
        prompt=(
            f"Review {focus.upper()} against ILPA Principles. Lead with a single token from "
            "{LP-favorable, Market, GP-favorable, Silent}; then give a short governing-clause quote, "
            'section number, and analysis. Include [Source N] citations; write "Silent — Not found" when unsupported.'
        ),
    )


LP_LPA_REVIEW = WorkflowCreate(
    name="LPA / ILPA-Alignment Review",
    description="Clause-level LPA review against ILPA alignment principles",
    entity_type="fund",
    type="tabular",
    row_source="multi_doc_synthesis",
    output_format="excel",
    columns=[
        _alignment_column(1, "Economics", "fees, carry, and clawback economics"),
        _alignment_column(2, "Key person", "key-person protections"),
        _alignment_column(3, "GP removal & termination", "GP removal and fund termination"),
        _alignment_column(4, "Indemnification & exculpation scope", "indemnification and exculpation scope"),
        _alignment_column(5, "LPAC powers & consents", "LPAC powers, information rights, and consents"),
        _alignment_column(6, "Transfer & withdrawal restrictions", "LP transfer and withdrawal restrictions"),
        _alignment_column(7, "Reporting undertakings", "financial and investor reporting undertakings"),
        _alignment_column(8, "Fiduciary-duty modifications", "waivers or modifications of fiduciary duties"),
    ],
)


LP_SIDE_LETTERS = WorkflowCreate(
    name="Side Letter Obligation Extractor",
    description="Per-LP promises, triggers, MFN mechanics, and quarterly compliance checks",
    entity_type="fund",
    type="tabular",
    row_source="one_doc_per_row",
    output_format="excel",
    columns=[
        WorkflowColumnInput(order_index=1, label="Obligations list", format="markdown", prompt='Extract EVERY SIDE-LETTER PROMISE as one bullet per obligation with section references and [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=2, label="Category mix", format="kv", prompt='Count obligations using exactly: Fee: [count]\nMFN: [count]\nCo-invest: [count]\nReporting: [count]\nTransfer: [count]\nExcuse: [count]\nRegulatory: [count]. Include [Source N] citations.'),
        WorkflowColumnInput(order_index=3, label="MFN provision", format="markdown", prompt='Extract MFN SCOPE, election mechanics, notice deadlines, and carve-outs. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=4, label="Deadlines & triggers", format="markdown", prompt='List every TIME-BOUND OR EVENT-TRIGGERED obligation with timing, trigger, owner, and section. Include [Source N] citations; write "Not found" if unsupported.'),
        WorkflowColumnInput(order_index=5, label="Ongoing vs one-time", format="kv", prompt='Classify obligations using exactly: Ongoing: [desc]\nOne-time: [desc]. Include [Source N] citations; write "Not found" where unsupported.'),
        WorkflowColumnInput(order_index=6, label="Quarterly verification checklist", format="bulleted_list", prompt='Create a QUARTERLY VERIFICATION CHECKLIST of evidence to confirm each ongoing side-letter promise was honored. Tie each item to the obligation and include [Source N] citations.'),
    ],
)


LP_COMMITMENT_MEMO = WorkflowCreate(
    name="Fund Commitment Memo",
    description="Four-stage LP underwriting workflow from manager assessment to recommendation",
    entity_type="fund",
    type="assistant",
    output_format="word",
    stages=[
        WorkflowStageInput(order_index=1, label="Manager & Strategy Assessment", checkpoint=True, prompt_md="Assess the MANAGER AND STRATEGY from the pitchbook, DDQ, and PPM: firm history and ownership, team depth and succession, strategy and edge, fund size versus the prior fund with a size-creep check, and market environment. Cite every claim as [filename p.N]; write \"Not found\" for unsupported topics."),
        WorkflowStageInput(order_index=2, label="Track Record & Terms Diagnostic", checkpoint=True, prompt_md="Diagnose TRACK RECORD AND TERMS: performance by fund (IRR, TVPI, DPI), dispersion and loss ratio, realized versus unrealized mix, a DPI-versus-IRR quality note, and terms versus ILPA norms. Cite every claim as [filename p.N]. Insert explicit [BENCHMARK — fill in] placeholders wherever peer data is required."),
        WorkflowStageInput(order_index=3, label="ODD & Risk Summary", checkpoint=True, prompt_md="Summarize ODD AND UNDERWRITING RISK: operational findings, open diligence items, reference-call gaps, and side-letter asks to negotiate. Cite every claim as [filename p.N]; write \"Not found\" when evidence is absent."),
        WorkflowStageInput(order_index=4, label="Compose Commitment Memo", checkpoint=False, prompt_md="Using the analyst-edited outputs of Stages 1–3 as authoritative, compose the FUND COMMITMENT MEMO with: Executive Summary; Organization; Strategy; Track Record; Fund Terms; Operational Assessment; Risks & Mitigants; Recommendation. State the proposed commitment or use [COMMITMENT AMOUNT]. Preserve all citations and do not overwrite analyst judgments."),
    ],
)


LP_BUILTIN_TEMPLATES: list[tuple[str, WorkflowCreate]] = [
    ("builtin_lp_ddq_scan", LP_DDQ_SCAN),
    ("builtin_lp_track_record", LP_TRACK_RECORD),
    ("builtin_lp_fund_terms", LP_FUND_TERMS),
    ("builtin_lp_odd_screen", LP_ODD_SCREEN),
    ("builtin_lp_lpa_review", LP_LPA_REVIEW),
    ("builtin_lp_side_letters", LP_SIDE_LETTERS),
    ("builtin_lp_commitment_memo", LP_COMMITMENT_MEMO),
]

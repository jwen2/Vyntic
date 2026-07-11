"""Generate synthetic Hillpath Capital LP diligence fixtures."""

from pathlib import Path
from html import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent
NAVY = colors.HexColor("#132238")
BLUE = colors.HexColor("#3159C7")
PALE = colors.HexColor("#EEF2FF")
GRAY = colors.HexColor("#5F6773")


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=30, textColor=NAVY, alignment=TA_CENTER, spaceAfter=16))
    styles.add(ParagraphStyle(name="CoverSub", parent=styles["Normal"], fontSize=12, leading=17, textColor=GRAY, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=NAVY, spaceBefore=10, spaceAfter=8))
    styles.add(ParagraphStyle(name="Subsection", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BLUE, spaceBefore=8, spaceAfter=5))
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=9.4, leading=13, spaceAfter=6))
    styles.add(ParagraphStyle(name="Note", parent=styles["BodyText"], fontSize=8.5, leading=12, textColor=GRAY, backColor=PALE, borderPadding=7, spaceBefore=6, spaceAfter=8))
    return styles


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D8DDE7"))
    canvas.line(0.7 * inch, 0.55 * inch, 7.8 * inch, 0.55 * inch)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GRAY)
    canvas.drawString(0.7 * inch, 0.35 * inch, "SYNTHETIC QA FIXTURE - NOT AN OFFERING DOCUMENT")
    canvas.drawRightString(7.8 * inch, 0.35 * inch, f"Page {doc.page}")
    canvas.restoreState()


def _doc(path: Path):
    return SimpleDocTemplate(str(path), pagesize=letter, rightMargin=0.7 * inch, leftMargin=0.7 * inch, topMargin=0.65 * inch, bottomMargin=0.7 * inch, title=path.stem, author="Vyntic synthetic QA fixtures")


def _table(rows, widths):
    header = ParagraphStyle("TableHeader", fontName="Helvetica-Bold", fontSize=8.2, leading=10, textColor=colors.white)
    body = ParagraphStyle("TableBody", fontName="Helvetica", fontSize=8.2, leading=10.5, textColor=colors.black)
    wrapped = [
        [Paragraph(escape(str(cell)), header if row_index == 0 else body) for cell in row]
        for row_index, row in enumerate(rows)
    ]
    table = Table(wrapped, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.2),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C7CEDA")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def build_ddq_ppm():
    s = _styles()
    story = [Spacer(1, 1.1 * inch), Paragraph("Hillpath Capital", s["CoverTitle"]), Paragraph("Fund IV - Combined DDQ and Private Placement Summary", s["CoverSub"]), Spacer(1, 0.35 * inch), Paragraph("Prepared for institutional LP diligence | As of June 30, 2026", s["CoverSub"]), Spacer(1, 0.65 * inch), Paragraph("This document is entirely synthetic. Names, performance, service providers, terms, and events are invented solely to test Vyntic extraction workflows.", s["Note"]), PageBreak()]

    story += [Paragraph("1. Firm and ownership", s["Section"]), Paragraph("Hillpath Capital was founded in 2011 and focuses on control investments in North American lower-middle-market software and technology-enabled services companies. The firm reports $1.4 billion of regulatory assets under management across three prior funds and related co-investment vehicles.", s["BodySmall"]), _table([
        ["Owner", "Role", "Economic ownership", "Voting ownership"],
        ["Evelyn Hart", "Co-founder / Managing Partner", "40%", "45%"],
        ["Marcus Lee", "Co-founder / Managing Partner", "30%", "35%"],
        ["Three next-generation partners", "Investment Partners", "30%", "20%"],
    ], [1.55 * inch, 2.25 * inch, 1.2 * inch, 1.2 * inch]), Paragraph("The DDQ states that the 2025 succession framework transfers investment committee leadership to the next-generation partners over five years. No signed ownership-transfer agreement was provided. The PPM key-person disclosure continues to identify Hart and Lee jointly as indispensable and does not name a successor.", s["Note"]),

    Paragraph("2. Team and succession", s["Section"]), Paragraph("The firm has 14 investment professionals, including five partners, four principals, and five associates. Investment-partner turnover has been zero since 2018. Two operating partners left during 2024; the DDQ characterizes both departures as planned, while the staffing appendix lists their replacements as open searches nine months later.", s["BodySmall"]), Paragraph("The key-person event is triggered if both founders cease devoting substantially all business time to Fund IV. A single-founder departure does not automatically suspend investment activity. The firm maintains $15 million of key-person life insurance per founder.", s["BodySmall"]), PageBreak(),

    Paragraph("3. Strategy and Fund IV sizing", s["Section"]), _table([
        ["Attribute", "Fund IV disclosure"],
        ["Target size / hard cap", "$650 million / $750 million"],
        ["Prior fund", "Fund III: $400 million committed capital"],
        ["Target companies", "$8-$25 million EBITDA; recurring-revenue software and services"],
        ["Portfolio construction", "10-12 platforms; $35-$65 million initial equity per platform"],
        ["Geography", "United States and Canada; up to 15% Western Europe"],
        ["Co-investment", "Targeting $150-$250 million aggregate alongside Fund IV"],
    ], [1.8 * inch, 4.5 * inch]), Paragraph("Fund IV's $650 million target is 62.5% larger than Fund III. Management attributes the increase to larger follow-on reserves and a dedicated software value-creation team. The target-company EBITDA range, however, rises only modestly from Fund III's $6-$20 million range.", s["Note"]),

    Paragraph("4. Economics and terms", s["Section"]), _table([
        ["Term", "PPM disclosure"],
        ["Management fee", "2.00% of commitments during the five-year investment period; 1.50% of invested cost thereafter"],
        ["Carried interest", "20%"],
        ["Preferred return", "8% compounded annually"],
        ["Waterfall", "Described as European / whole-of-fund"],
        ["GP commitment", "2.0% of commitments; 75% cash and up to 25% funded through management-fee waiver"],
        ["Fee offsets", "80% of transaction, monitoring, break-up, and director fees"],
        ["Fund term", "10 years plus two one-year extensions; second extension requires LPAC approval"],
        ["Recycling", "Recallable distributions up to 20% of commitments during the investment period"],
        ["Organizational expenses", "$1.25 million cap, excluding placement-agent costs"],
    ], [1.8 * inch, 4.5 * inch]), PageBreak(),

    Paragraph("5. Valuation, compliance, and operations", s["Section"]), _table([
        ["Area", "DDQ response"],
        ["Valuation", "Quarterly valuation committee chaired by CFO; two investment partners vote. Level 3 marks use public comps and DCF. No independent valuation agent is routinely engaged."],
        ["Auditor", "Grant Thornton LLP"],
        ["Fund administrator", "SS&C GlobeOp"],
        ["Fund counsel", "Ropes & Gray LLP"],
        ["Custody", "Portfolio securities generally held through acquisition SPVs; no separate fund custodian is named."],
        ["Compliance", "CCO is also General Counsel and reports administratively to the CFO. Annual review completed March 2026."],
        ["Cybersecurity", "MFA and endpoint detection deployed. Last external penetration test was September 2023; the 2025 test was postponed during a systems migration."],
        ["BCP", "Tabletop exercise completed November 2025. Recovery-time objective is 24 hours for investor reporting."],
    ], [1.55 * inch, 4.75 * inch]), Paragraph("The firm disclosed one 2024 SEC deficiency letter concerning late employee-trade preclearance. No enforcement action resulted. Expense-allocation testing found two broken-deal invoices totaling $184,000 initially charged only to Fund III; the amounts were corrected in February 2025.", s["BodySmall"]),

    Paragraph("6. ESG, LP base, conflicts, and references", s["Section"]), Paragraph("Hillpath applies an exclusion list and records annual carbon estimates for controlled portfolio companies, but it does not align reporting to SFDR or TCFD. Fund III's LP base is 38% public pensions, 24% endowments and foundations, 18% insurers, 12% family offices, and 8% fund-of-funds. Three reference contacts were provided; none is from an LP that declined a Fund III re-up.", s["BodySmall"]), Paragraph("Potential conflicts include allocation between Fund IV and a software continuation vehicle, operating-partner consulting fees charged to portfolio companies, and cross-fund follow-on investments. The conflicts policy gives the allocation committee discretion and requires LPAC review only for transactions above $25 million.", s["BodySmall"])]
    path = ROOT / "hillpath_fund_iv_ddq_ppm.pdf"
    _doc(path).build(story, onFirstPage=_footer, onLaterPages=_footer)
    return path


def build_lpa_side_letter():
    s = _styles()
    story = [Paragraph("Hillpath Capital Fund IV", s["CoverTitle"]), Paragraph("Selected LPA Clauses and Synthetic Investor Side Letter", s["CoverSub"]), Spacer(1, 0.25 * inch), Paragraph("Extracted clauses for QA only. This synthetic summary is not legal advice and does not represent an actual fund document.", s["Note"]), Paragraph("Article 5 - Management fees and expenses", s["Section"]), Paragraph("Section 5.2. The Partnership shall pay the Manager a fee equal to 2.00% per annum of aggregate Commitments through the end of the Investment Period and 1.50% per annum of aggregate acquisition cost of unrealized investments thereafter.", s["BodySmall"]), Paragraph("Section 5.5. Eighty percent (80%) of transaction, monitoring, break-up and director fees received by the Manager or its Affiliates shall offset the next management fee otherwise payable. The remaining twenty percent may be retained by the Manager.", s["BodySmall"]), Paragraph("Section 5.8. Organizational Expenses shall not exceed $1,250,000, excluding placement fees, extraordinary litigation, and expenses approved by the Advisory Committee.", s["BodySmall"]),

    Paragraph("Article 7 - Distributions and carried interest", s["Section"]), Paragraph("Section 7.3. Distributable proceeds shall first return contributed capital and the 8% Preferred Return to all Partners on an aggregate Partnership basis, after which the General Partner shall receive a catch-up and 20% carried interest.", s["BodySmall"]), Paragraph("Section 7.4. Notwithstanding Section 7.3, the General Partner may distribute realized proceeds investment by investment after reserving 30% of estimated carried interest in escrow. The escrow is tested annually and released when aggregate net asset value plus distributions exceeds contributed capital and the Preferred Return.", s["BodySmall"]), Paragraph("Review note: Section 7.4 introduces deal-by-deal mechanics despite the PPM's whole-of-fund description, making the operative waterfall hybrid rather than purely European.", s["Note"]), PageBreak(),

    Paragraph("Article 9 - Governance", s["Section"]), Paragraph("Section 9.1 - Key Person. The Investment Period shall be suspended only if both Evelyn Hart and Marcus Lee cease devoting substantially all business time to the Partnership. A majority in interest may resume the Investment Period within 120 days. No named successor automatically cures the event.", s["BodySmall"]), Paragraph("Section 9.4 - Removal for Cause. Limited Partners holding 75% of commitments may remove the General Partner following final adjudication of fraud, willful misconduct, or material breach that remains uncured for 45 days.", s["BodySmall"]), Paragraph("Section 9.5 - No-Fault Termination. Limited Partners holding 80% of commitments may terminate the Investment Period without cause. Upon termination, management fees step down but carried interest is not reduced for unrealized investments held at the termination date.", s["BodySmall"]), Paragraph("Section 9.8 - LPAC. The Advisory Committee may approve conflicts, valuation-policy exceptions, affiliate transactions, and the second one-year extension. LPAC approval is advisory except where this Agreement expressly states otherwise.", s["BodySmall"]),

    Paragraph("Article 12 - Transfers, reporting, and fiduciary standard", s["Section"]), Paragraph("Section 12.2. Transfers require General Partner consent, which may be withheld in its sole discretion, plus completion of AML, tax, and securities-law review. The General Partner may charge reasonable transfer expenses without a stated cap.", s["BodySmall"]), Paragraph("Section 12.6. Quarterly unaudited statements are due within 60 days; annual audited statements within 120 days. Capital-account statements will show contributions, distributions, fees, and ending NAV.", s["BodySmall"]), Paragraph("Section 12.9. To the maximum extent permitted by law, fiduciary duties are modified so that the General Partner may consider its own interests and those of Affiliates when resolving conflicts approved by the LPAC.", s["BodySmall"]), PageBreak(),

    Paragraph("Synthetic side letter - North County Retirement System", s["Section"]), _table([
        ["Section", "Obligation"],
        ["1 - Fee discount", "Management fee reduced by 0.25% for so long as NCRC maintains at least $35 million of commitments."],
        ["2 - MFN", "Within 45 days after final close, provide an election package covering more favorable terms granted to investors committing $50 million or less. Regulatory, tax, and strategic-investor provisions are excluded."],
        ["3 - Co-invest", "Use commercially reasonable efforts to offer NCRC its pro rata share of co-investments exceeding $40 million of aggregate equity need. No allocation is guaranteed."],
        ["4 - Reporting", "Deliver quarterly ESG incident and portfolio-diversity reporting within 55 days after quarter-end, five days earlier than the standard quarterly package."],
        ["5 - Excuse right", "NCRC may be excused from investments involving thermal coal revenue above 10% after providing written notice within 10 business days of the investment notice."],
        ["6 - Transfer", "Consent shall not be unreasonably withheld for transfers to another North County governmental plan, subject to AML and tax review."],
        ["7 - Verification", "The Manager shall certify compliance with Sections 1, 4, and 5 in each fourth-quarter investor report."],
    ], [1.4 * inch, 4.9 * inch]), Paragraph("Quarterly monitoring cues: verify the discounted fee calculation; log the MFN package and election deadline; compare co-invest offers with eligible transactions; confirm ESG reporting by day 55; test excuse-right notices; and obtain the annual certification in the fourth-quarter report.", s["Note"])]
    path = ROOT / "hillpath_fund_iv_lpa_side_letter.pdf"
    _doc(path).build(story, onFirstPage=_footer, onLaterPages=_footer)
    return path


if __name__ == "__main__":
    for generated in (build_ddq_ppm(), build_lpa_side_letter()):
        print(generated)

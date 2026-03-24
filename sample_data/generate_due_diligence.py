import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle

OUT = Path(__file__).parent
styles = getSampleStyleSheet()

def make_table(headers, rows, widths=None):
    data = [headers] + rows
    if not widths:
        widths = [2.0 * inch] + [1.2 * inch] * (len(headers) - 1)
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    return t

def generate_financial_dd():
    filename = OUT / "acme_saas_financial_dd.pdf"
    doc = SimpleDocTemplate(str(filename), pagesize=letter)
    elements = []
    
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#1e293b"))
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14)
    
    elements.append(Paragraph("Project Acme: Financial Due Diligence - Quality of Earnings", h1))
    elements.append(Spacer(1, 0.2 * inch))
    elements.append(Paragraph("This report presents the Quality of Earnings (QofE) analysis for Acme Cloud Solutions for the LTM period ending Dec 2024.", body))
    
    elements.append(Paragraph("1. Revenue Recognition Audit", styles["Heading2"]))
    elements.append(Paragraph("We analyzed the deferred revenue schedules and contract start dates. Revenue is recognized ratably over the subscription term, typically 12-36 months.", body))
    
    headers = ["Component", "Reported ($M)", "Adjustment ($M)", "Adjusted ($M)"]
    rows = [
        ["Total Revenue", "42.0", "(0.8)", "41.2"],
        ["Cost of Sales", "(6.3)", "0.2", "(6.1)"],
        ["Operating Exp", "(29.8)", "1.2", "(28.6)"],
        ["EBITDA", "5.9", "0.6", "6.5"]
    ]
    elements.append(make_table(headers, rows))
    elements.append(Spacer(1, 0.2 * inch))
    elements.append(Paragraph("Key adjustment includes non-recurring software implementation costs capitalized versus expensed and normalization of executive compensation.", body))
    
    doc.build(elements)
    print(f"Generated {filename}")

def generate_legal_dd():
    filename = OUT / "acme_saas_legal_dd.pdf"
    doc = SimpleDocTemplate(str(filename), pagesize=letter)
    elements = []
    
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#1e293b"))
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14)
    
    elements.append(Paragraph("Project Acme: Legal Due Diligence - IP & Material Contracts", h1))
    elements.append(Spacer(1, 0.2 * inch))
    
    elements.append(Paragraph("1. Intellectual Property Portfolio", styles["Heading2"]))
    elements.append(Paragraph("Acme Cloud Solutions holds 4 granted US patents and 12 pending applications focused on distributed database synchronization for ERP systems. Most IP is internally developed.", body))
    
    elements.append(Paragraph("2. Material Customer Contracts", styles["Heading2"]))
    elements.append(Paragraph("We reviewed the Top 10 customer contracts. 35% of ARR is subject to change-of-control provisions requiring written consent within 90 days. Key termination clauses are standard market terms.", body))
    
    headers = ["Customer", "ARR ($M)", "Term", "CoC Provision"]
    rows = [
        ["Globex Corp", "2.1", "3 yrs", "Consent Required"],
        ["Initech Systems", "1.8", "2 yrs", "Notice Only"],
        ["Soylent Mfg", "1.5", "5 yrs", "Consent Required"]
    ]
    elements.append(make_table(headers, rows))
    
    doc.build(elements)
    print(f"Generated {filename}")

def generate_operational_dd():
    filename = OUT / "acme_saas_operational_dd.pdf"
    doc = SimpleDocTemplate(str(filename), pagesize=letter)
    elements = []
    
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#1e293b"))
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14)
    
    elements.append(Paragraph("Project Acme: Operational Due Diligence - Technology & Security", h1))
    elements.append(Spacer(1, 0.2 * inch))
    
    elements.append(Paragraph("1. Technical Infrastructure", styles["Heading2"]))
    elements.append(Paragraph("The platform is hosted on AWS using a microservices architecture (Node.js/Python). Databases include PostgreSQL for transactional data and Snowflake for analytics.", body))
    
    elements.append(Paragraph("2. Cybersecurity Profile", styles["Heading2"]))
    elements.append(Paragraph("The company is SOC-2 Type II compliant. Recent penetration tests showed no critical vulnerabilities. Backup and disaster recovery RPO/RTO meet enterprise standards.", body))
    
    headers = ["Service", "Provider", "Region", "Uptime SLA"]
    rows = [
        ["Hosting", "AWS", "US-East-1", "99.99%"],
        ["Analytics", "Snowflake", "US-West-2", "99.9%"],
        ["CDN", "Cloudflare", "Global", "100.0%"]
    ]
    elements.append(make_table(headers, rows))
    
    doc.build(elements)
    print(f"Generated {filename}")

def generate_hr_dd():
    filename = OUT / "acme_saas_hr_dd.pdf"
    doc = SimpleDocTemplate(str(filename), pagesize=letter)
    elements = []
    
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#1e293b"))
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14)
    
    elements.append(Paragraph("Project Acme: Human Resources & Management Due Diligence", h1))
    elements.append(Spacer(1, 0.2 * inch))
    
    elements.append(Paragraph("1. Management Assessment", styles["Heading2"]))
    elements.append(Paragraph("The senior leadership team consists of 8 members with an average tenure of 4.2 years. The CEO and CTO are co-founders with 10% and 8% equity respectively.", body))
    
    elements.append(Paragraph("2. Employee Retention & Culture", styles["Heading2"]))
    elements.append(Paragraph("Annual turnover is 12%, significantly lower than the industry average (18%). Recruitment for DevOps and specialized AI engineers remains a bottleneck for growth.", body))
    
    headers = ["Department", "Headcount", "Avg Salary ($K)", "Churn %"]
    rows = [
        ["Engineering", "145", "165", "8.5%"],
        ["Sales/Marketing", "82", "110", "15.0%"],
        ["Customer Success", "64", "85", "10.0%"]
    ]
    elements.append(make_table(headers, rows))
    
    doc.build(elements)
    print(f"Generated {filename}")

if __name__ == "__main__":
    generate_financial_dd()
    generate_legal_dd()
    generate_operational_dd()
    generate_hr_dd()

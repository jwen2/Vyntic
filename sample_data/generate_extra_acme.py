import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle

OUT = Path(__file__).parent
styles = getSampleStyleSheet()

def make_table_flowable(headers, rows):
    data = [headers] + rows
    t = Table(data, colWidths=[1.8 * inch] + [1.1 * inch] * (len(headers) - 1))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a365d")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
    ]))
    return t

def generate_extra_doc(index: int):
    filename = OUT / f"acme_saas_extra_{index}.pdf"
    doc = SimpleDocTemplate(str(filename), pagesize=letter)
    
    title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=18, textColor=colors.HexColor("#1a365d"))
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14)
    
    elements = []
    elements.append(Paragraph(f"Acme Cloud Solutions - Supplemental Addendum {index}", title_style))
    elements.append(Spacer(1, 0.5 * inch))
    
    # Random text density
    text = (f"This is supplemental document {index} for the Acme Cloud Solutions due diligence process. "
            "It contains additional operational metrics and expanded descriptions of our product roadmap "
            "and market penetration strategies. " * (index + 2))
    
    elements.append(Paragraph(text, body))
    elements.append(Spacer(1, 0.3 * inch))
    
    # Add a table
    headers = ["Quarter", "Users", "Margin", "Growth"]
    rows = [
        [f"Q{q} 2024", f"{1000 * index + q * 50}", f"{80 + q}%", f"{10 + index}%"]
        for q in range(1, 5)
    ]
    elements.append(make_table_flowable(headers, rows))
    
    doc.build(elements)
    print(f"Generated {filename}")

if __name__ == "__main__":
    for i in range(1, 11):
        generate_extra_doc(i)

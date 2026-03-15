"""
Document parser: converts PDFs and Excel files into structured Markdown sections.
Uses pdfplumber for PDFs (preserves table structure locally) and openpyxl for Excel.
"""
import uuid
from pathlib import Path

from app.models.document import ParsedSection, DocumentMetadata


async def parse_pdf(file_bytes: bytes, filename: str, deal_id: str) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Parse a PDF using pdfplumber, extracting text and tables as Markdown."""
    import pdfplumber
    from io import BytesIO

    doc_id = f"{deal_id}_{uuid.uuid4().hex[:8]}"
    sections = []

    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            page_parts = []

            # Extract tables first
            tables = page.extract_tables()
            table_bboxes = []

            if tables:
                for tbl_settings in page.find_tables():
                    table_bboxes.append(tbl_settings.bbox)

                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    md_table = _table_to_markdown(table)
                    if md_table.strip():
                        page_parts.append(md_table)

            # Extract text (full page text — includes table text but that's ok
            # for a PoC; production would subtract table regions)
            text = page.extract_text()
            if text and text.strip():
                # If we already have tables, add text separately to preserve structure
                if tables:
                    page_parts.insert(0, text.strip())
                else:
                    page_parts.append(text.strip())

            content = "\n\n".join(page_parts)
            if content.strip():
                section_type = "table" if tables else "text"
                sections.append(ParsedSection(
                    content=content,
                    metadata={
                        "source_file": filename,
                        "page_number": page_num,
                        "section_type": section_type,
                        "deal_id": deal_id,
                        "doc_id": doc_id,
                    }
                ))

    metadata = DocumentMetadata(
        doc_id=doc_id,
        deal_id=deal_id,
        filename=filename,
        page_count=len(sections),
    )

    return metadata, sections


async def parse_excel(file_bytes: bytes, filename: str, deal_id: str) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Parse an Excel file using openpyxl, converting each sheet to Markdown tables."""
    import openpyxl
    from io import BytesIO

    doc_id = f"{deal_id}_{uuid.uuid4().hex[:8]}"
    wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)

    sections = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue

        # Build Markdown table
        md_lines = [f"## {sheet_name}\n"]

        # Header row
        headers = [str(c) if c is not None else "" for c in rows[0]]
        md_lines.append("| " + " | ".join(headers) + " |")
        md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

        # Data rows
        for row in rows[1:]:
            cells = [str(c) if c is not None else "" for c in row]
            while len(cells) < len(headers):
                cells.append("")
            md_lines.append("| " + " | ".join(cells[:len(headers)]) + " |")

        content = "\n".join(md_lines)
        sections.append(ParsedSection(
            content=content,
            metadata={
                "source_file": filename,
                "page_number": 1,
                "section_type": "table",
                "sheet_name": sheet_name,
                "deal_id": deal_id,
                "doc_id": doc_id,
            }
        ))

    metadata = DocumentMetadata(
        doc_id=doc_id,
        deal_id=deal_id,
        filename=filename,
        page_count=len(sections),
    )

    return metadata, sections


async def parse_document(file_bytes: bytes, filename: str, deal_id: str) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Route to the appropriate parser based on file extension."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return await parse_pdf(file_bytes, filename, deal_id)
    elif ext in (".xlsx", ".xls"):
        return await parse_excel(file_bytes, filename, deal_id)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Supported: .pdf, .xlsx, .xls")


def _table_to_markdown(table: list[list]) -> str:
    """Convert a pdfplumber table (list of rows) to Markdown."""
    if not table or len(table) < 1:
        return ""

    # Clean cells
    def clean(cell):
        if cell is None:
            return ""
        return str(cell).replace("\n", " ").strip()

    headers = [clean(c) for c in table[0]]
    if not any(headers):
        return ""

    lines = []
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

    for row in table[1:]:
        cells = [clean(c) for c in row]
        # Pad to match headers
        while len(cells) < len(headers):
            cells.append("")
        lines.append("| " + " | ".join(cells[:len(headers)]) + " |")

    return "\n".join(lines)

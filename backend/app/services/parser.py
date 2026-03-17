"""
Document parser: converts PDFs and Excel files into structured Markdown sections.
Uses docling for PDFs (high-quality table + text extraction) and openpyxl for Excel.
"""
import os
import uuid
import tempfile
from pathlib import Path

from app.models.document import ParsedSection, DocumentMetadata


async def parse_pdf(file_bytes: bytes, filename: str, deal_id: str) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Parse a PDF using docling, extracting text and tables as Markdown."""
    from docling.document_converter import DocumentConverter
    from docling_core.types.doc import TableItem, TextItem

    doc_id = f"{deal_id}_{uuid.uuid4().hex[:8]}"
    sections = []

    # Docling requires a file path, so write bytes to a temp file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        converter = DocumentConverter()
        result = converter.convert(tmp_path)
        doc = result.document

        # Group content by page number
        pages: dict[int, dict] = {}
        for item, _level in doc.iterate_items():
            # Determine page number from provenance
            if hasattr(item, "prov") and item.prov:
                page_num = item.prov[0].page_no
            else:
                page_num = 1

            if page_num not in pages:
                pages[page_num] = {"text": [], "tables": [], "has_table": False}

            if isinstance(item, TableItem):
                md_table = item.export_to_markdown()
                if md_table and md_table.strip():
                    pages[page_num]["tables"].append(md_table)
                    pages[page_num]["has_table"] = True
            elif isinstance(item, TextItem):
                text = item.text
                if text and text.strip():
                    pages[page_num]["text"].append(text.strip())

        # Build sections ordered by page
        for page_num in sorted(pages.keys()):
            page_data = pages[page_num]
            # Text first, then tables (same order as previous pdfplumber approach)
            parts = page_data["text"] + page_data["tables"]
            content = "\n\n".join(parts)

            if content.strip():
                section_type = "table" if page_data["has_table"] else "text"
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
    finally:
        os.unlink(tmp_path)

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

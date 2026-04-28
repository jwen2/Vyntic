"""
Document parser: converts PDFs and Excel files into structured Markdown sections.
Uses docling for PDFs (high-quality table + text extraction) and openpyxl for Excel.
"""
import os
import uuid
import gc
import json
import multiprocessing
import tempfile
import traceback
from pathlib import Path

from app.config import settings
from app.models.document import ParsedSection, DocumentMetadata


def _configure_docling_runtime() -> None:
    """Keep Docling's model stack conservative on local/macOS startup."""
    os.environ.setdefault("OMP_NUM_THREADS", str(settings.docling_num_threads))
    os.environ.setdefault("MKL_NUM_THREADS", str(settings.docling_num_threads))
    os.environ.setdefault("NUMEXPR_NUM_THREADS", str(settings.docling_num_threads))
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", str(settings.docling_num_threads))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def _docling_convert_pdf(file_path: str) -> list[dict]:
    """Run Docling and return plain page data that can cross process boundaries."""
    _configure_docling_runtime()

    from docling.document_converter import DocumentConverter
    from docling.document_converter import PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import (
        AcceleratorDevice,
        AcceleratorOptions,
        PdfPipelineOptions,
    )
    from docling_core.types.doc import TableItem, TextItem

    device_name = settings.docling_device.lower()
    device = AcceleratorDevice.CPU
    if device_name in {item.value for item in AcceleratorDevice}:
        device = AcceleratorDevice(device_name)

    pipeline_options = PdfPipelineOptions(
        accelerator_options=AcceleratorOptions(
            num_threads=settings.docling_num_threads,
            device=device,
        ),
        document_timeout=settings.docling_timeout_seconds,
        do_ocr=settings.docling_ocr_enabled,
        ocr_batch_size=1,
        layout_batch_size=1,
        table_batch_size=1,
        queue_max_size=8,
    )
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )
    result = converter.convert(file_path)
    doc = result.document

    pages: dict[int, dict] = {}
    for item, _level in doc.iterate_items():
        if hasattr(item, "prov") and item.prov:
            page_num = item.prov[0].page_no
        else:
            page_num = 1

        if page_num not in pages:
            pages[page_num] = {"text": [], "tables": [], "has_table": False}

        if isinstance(item, TableItem):
            md_table = item.export_to_markdown(doc=doc)
            if md_table and md_table.strip():
                pages[page_num]["tables"].append(md_table)
                pages[page_num]["has_table"] = True
        elif isinstance(item, TextItem):
            text = item.text
            if text and text.strip():
                pages[page_num]["text"].append(text.strip())

    return [
        {
            "page_number": page_num,
            "text": pages[page_num]["text"],
            "tables": pages[page_num]["tables"],
            "has_table": pages[page_num]["has_table"],
        }
        for page_num in sorted(pages.keys())
    ]


def _docling_worker(file_path: str, output_path: str) -> None:
    try:
        payload = {"status": "ok", "pages": _docling_convert_pdf(file_path)}
    except Exception:
        payload = {"status": "error", "error": traceback.format_exc()}
    Path(output_path).write_text(json.dumps(payload), encoding="utf-8")
    gc.collect()


def _read_docling_worker_output(output_path: Path) -> list[dict]:
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise FileNotFoundError("Docling worker produced no parse output")

    payload = json.loads(output_path.read_text(encoding="utf-8"))
    if payload["status"] == "error":
        raise RuntimeError(payload["error"])
    return payload["pages"]


def _docling_process_context() -> multiprocessing.context.BaseContext:
    return multiprocessing.get_context("spawn")


def _convert_pdf_isolated(file_path: Path) -> list[dict]:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        output_path = Path(tmp.name)

    try:
        ctx = _docling_process_context()
        proc = ctx.Process(
            target=_docling_worker,
            args=(str(file_path), str(output_path)),
        )
        proc.start()
        proc.join(settings.docling_timeout_seconds + 30)

        if proc.is_alive():
            proc.terminate()
            proc.join(10)
            if proc.is_alive():
                proc.kill()
                proc.join(10)
            raise TimeoutError(
                f"Docling timed out after {settings.docling_timeout_seconds}s"
            )

        if proc.exitcode != 0:
            raise RuntimeError(
                f"Docling worker exited unexpectedly with code {proc.exitcode}"
            )

        return _read_docling_worker_output(output_path)
    finally:
        try:
            output_path.unlink()
        except FileNotFoundError:
            pass


def _build_pdf_sections(
    doc_id: str,
    filename: str,
    deal_id: str,
    pages: list[dict],
) -> list[ParsedSection]:
    # Emit prose and each table as separate sections so a citation can point
    # at the specific table the LLM used, instead of a mixed page blob whose
    # snippet would only show the page preamble.
    sections = []
    for page_data in pages:
        text_content = "\n\n".join(page_data["text"]).strip()
        if text_content:
            sections.append(
                ParsedSection(
                    content=text_content,
                    metadata={
                        "source_file": filename,
                        "page_number": page_data["page_number"],
                        "section_type": "text",
                        "deal_id": deal_id,
                        "doc_id": doc_id,
                    },
                )
            )
        for table_md in page_data["tables"]:
            table_content = table_md.strip()
            if not table_content:
                continue
            sections.append(
                ParsedSection(
                    content=table_content,
                    metadata={
                        "source_file": filename,
                        "page_number": page_data["page_number"],
                        "section_type": "table",
                        "deal_id": deal_id,
                        "doc_id": doc_id,
                    },
                )
            )
    return sections


async def parse_pdf_path(
    file_path: Path,
    filename: str,
    deal_id: str,
) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Parse a PDF file using Docling with memory-conscious defaults."""
    doc_id = f"{deal_id}_{uuid.uuid4().hex[:8]}"
    if settings.docling_subprocess_enabled:
        pages = _convert_pdf_isolated(file_path)
    else:
        pages = _docling_convert_pdf(str(file_path))

    sections = _build_pdf_sections(doc_id, filename, deal_id, pages)
    metadata = DocumentMetadata(
        doc_id=doc_id,
        deal_id=deal_id,
        filename=filename,
        page_count=len(sections),
    )

    return metadata, sections


async def parse_pdf(
    file_bytes: bytes,
    filename: str,
    deal_id: str,
) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Parse PDF bytes using Docling, extracting text and tables as Markdown."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        return await parse_pdf_path(Path(tmp_path), filename, deal_id)
    finally:
        os.unlink(tmp_path)


async def parse_excel(
    file_bytes: bytes,
    filename: str,
    deal_id: str,
) -> tuple[DocumentMetadata, list[ParsedSection]]:
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
        sections.append(
            ParsedSection(
                content=content,
                metadata={
                    "source_file": filename,
                    "page_number": 1,
                    "section_type": "table",
                    "sheet_name": sheet_name,
                    "deal_id": deal_id,
                    "doc_id": doc_id,
                },
            )
        )

    metadata = DocumentMetadata(
        doc_id=doc_id,
        deal_id=deal_id,
        filename=filename,
        page_count=len(sections),
    )

    return metadata, sections


async def parse_document(
    file_bytes: bytes,
    filename: str,
    deal_id: str,
) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Route to the appropriate parser based on file extension."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return await parse_pdf(file_bytes, filename, deal_id)
    elif ext in (".xlsx", ".xls"):
        return await parse_excel(file_bytes, filename, deal_id)
    else:
        raise ValueError(
            f"Unsupported file type: {ext}. Supported: .pdf, .xlsx, .xls"
        )


async def parse_document_path(
    file_path: Path,
    filename: str,
    deal_id: str,
) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Route to the appropriate parser for a file already on disk."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return await parse_pdf_path(file_path, filename, deal_id)
    elif ext in (".xlsx", ".xls"):
        return await parse_excel(file_path.read_bytes(), filename, deal_id)
    else:
        raise ValueError(
            f"Unsupported file type: {ext}. Supported: .pdf, .xlsx, .xls"
        )

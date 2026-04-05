"""Deal CRUD routes."""
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.models.deal import Deal, DealCreate, DealUpdate, DEAL_STAGES, SECTOR_TAGS
from app.models.document import DocumentMetadata
from app.services import deal_store
from app.database import UserRow
from app.auth import get_current_user, get_current_user_or_query_token, require_deal_access, grant_deal_access

router = APIRouter(prefix="/deals", tags=["deals"])


@router.post("", response_model=Deal)
def create_deal(data: DealCreate, current_user: UserRow = Depends(get_current_user)):
    try:
        deal = deal_store.create_deal(data)
        # Auto-grant access to the creator
        grant_deal_access(current_user.id, data.deal_id, role="admin")
        return deal
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=list[Deal])
def list_deals(current_user: UserRow = Depends(get_current_user)):
    return deal_store.list_deals()


@router.get("/metadata/stages")
def get_stages():
    """Return valid pipeline stages."""
    return DEAL_STAGES


@router.get("/metadata/tags")
def get_tags():
    """Return suggested sector tags."""
    return SECTOR_TAGS


@router.get("/{deal_id}", response_model=Deal)
def get_deal(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return deal


@router.patch("/{deal_id}", response_model=Deal)
def update_deal(deal_id: str, data: DealUpdate, current_user: UserRow = Depends(get_current_user)):
    require_deal_access(current_user, deal_id)
    deal = deal_store.update_deal(deal_id, data)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return deal


@router.get("/{deal_id}/documents", response_model=list[DocumentMetadata])
def list_deal_documents(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return deal_store.list_documents(deal_id)


@router.delete("/{deal_id}")
async def delete_deal(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    require_deal_access(current_user, deal_id)
    from app.services.vector_store import delete_deal_vectors

    if not deal_store.delete_deal(deal_id):
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    try:
        await delete_deal_vectors(deal_id)
    except Exception:
        pass  # Best-effort cleanup of vectors

    # Clean up uploaded files
    deal_upload_dir = os.path.join(settings.uploads_dir, deal_id)
    if os.path.isdir(deal_upload_dir):
        shutil.rmtree(deal_upload_dir)

    return {"status": "deleted", "deal_id": deal_id}


@router.get("/{deal_id}/documents/{filename}/view")
async def view_document(deal_id: str, filename: str, sheet: int | None = None, current_user: UserRow = Depends(get_current_user_or_query_token)):
    require_deal_access(current_user, deal_id)
    """Serve an original uploaded document file for inline viewing (not download).

    For Excel files, optionally pass ?sheet=0 to view a specific sheet.
    Large sheets are truncated to the first 500 rows.
    """
    file_path = os.path.join(settings.uploads_dir, deal_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Document file not found")

    lower = filename.lower()

    # Excel files: convert to HTML table for inline preview
    if lower.endswith((".xlsx", ".xls")):
        return _excel_to_html_response(file_path, filename, active_sheet=sheet)

    if lower.endswith(".pdf"):
        media_type = "application/pdf"
    elif lower.endswith(".docx"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif lower.endswith(".txt"):
        media_type = "text/plain"
    elif lower.endswith(".csv"):
        media_type = "text/csv"
    else:
        media_type = "application/octet-stream"

    # content_disposition_type="inline" prevents download — renders in browser
    return FileResponse(
        file_path,
        media_type=media_type,
        content_disposition_type="inline",
    )


MAX_PREVIEW_ROWS = 500


def _excel_to_html_response(file_path: str, filename: str, active_sheet: int | None = None):
    """Convert an Excel file to a styled HTML page for inline viewing.

    Only renders the active sheet (default: first). Truncates at MAX_PREVIEW_ROWS
    to keep response times fast for large spreadsheets. Sheet tabs let users
    switch between sheets via server-side reload (?sheet=N).
    """
    from fastapi.responses import HTMLResponse
    import openpyxl

    try:
        wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read Excel file: {e}")

    sheet_names = wb.sheetnames
    active_idx = active_sheet if active_sheet is not None and 0 <= active_sheet < len(sheet_names) else 0

    html_parts = [
        "<!DOCTYPE html><html><head>",
        "<meta charset='utf-8'>",
        f"<title>{filename}</title>",
        "<style>",
        "  * { box-sizing: border-box; margin: 0; padding: 0; }",
        "  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; color: #111827; padding: 24px; }",
        "  h1 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #374151; }",
        "  h2 { font-size: 14px; font-weight: 600; margin: 8px 0; color: #6b7280; }",
        "  table { border-collapse: collapse; width: 100%; margin-bottom: 16px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }",
        "  th { background: #f3f4f6; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; position: sticky; top: 0; z-index: 1; }",
        "  th, td { padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left; font-size: 13px; white-space: nowrap; }",
        "  tr:nth-child(even) { background: #f9fafb; }",
        "  tr:hover { background: #eff6ff; }",
        "  td.num { text-align: right; font-variant-numeric: tabular-nums; }",
        "  .sheet-tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }",
        "  .sheet-tab { padding: 6px 12px; font-size: 12px; border-radius: 6px; background: #e5e7eb; cursor: pointer; border: none; color: #374151; text-decoration: none; }",
        "  .sheet-tab.active { background: #3b82f6; color: white; }",
        "  .truncated { padding: 12px; text-align: center; color: #9ca3af; font-size: 13px; font-style: italic; }",
        "</style>",
        "</head><body>",
        f"<h1>{filename}</h1>",
    ]

    # Sheet tabs — each is a link that reloads with ?sheet=N (server-side, no full Excel re-parse overhead for client)
    if len(sheet_names) > 1:
        html_parts.append("<div class='sheet-tabs'>")
        for i, name in enumerate(sheet_names):
            active_cls = "active" if i == active_idx else ""
            # Build URL that swaps the sheet param
            html_parts.append(
                f"<a class='sheet-tab {active_cls}' href='?sheet={i}'>{name}</a>"
            )
        html_parts.append("</div>")

    # Render only the active sheet
    ws = wb[sheet_names[active_idx]]
    html_parts.append(f"<h2>{sheet_names[active_idx]}</h2>")
    html_parts.append("<div style='overflow-x:auto'><table>")

    row_count = 0
    truncated = False
    for row_idx, row in enumerate(ws.iter_rows(values_only=True)):
        if row_idx >= MAX_PREVIEW_ROWS:
            truncated = True
            break
        tag = "th" if row_idx == 0 else "td"
        html_parts.append("<tr>")
        for cell in row:
            val = "" if cell is None else str(cell)
            # Escape HTML entities for all cells (headers and data)
            val = val.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            cls = ""
            if tag == "td":
                try:
                    float(str(cell).replace(",", "").replace("$", "").replace("%", ""))
                    cls = " class='num'"
                except (ValueError, TypeError, AttributeError):
                    pass
            html_parts.append(f"<{tag}{cls}>{val}</{tag}>")
        html_parts.append("</tr>")
        row_count += 1

    html_parts.append("</table></div>")

    if truncated:
        html_parts.append(
            f"<div class='truncated'>Showing first {MAX_PREVIEW_ROWS} of {ws.max_row or '?'} rows. "
            f"Download the file for the complete data.</div>"
        )

    html_parts.append(f"<div style='margin-top:8px;font-size:12px;color:#9ca3af;'>{row_count} rows displayed</div>")
    html_parts.append("</body></html>")

    wb.close()
    return HTMLResponse(content="\n".join(html_parts))

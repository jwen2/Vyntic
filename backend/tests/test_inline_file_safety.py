"""
Inline document serving hardening (Plan 2, S9-XSS).

User-uploaded files are served from the app origin, so anything that renders
as HTML there can script against the app. Pins:
- Excel→HTML preview escapes cell values AND sheet names / filename
  (sheet names are author-controlled and were interpolated raw).
- The preview page carries a restrictive CSP + nosniff.
- Unknown file types are served as attachment (never inline) with nosniff,
  so a renamed .html can't render in-origin.
"""
import os

import openpyxl
import pytest

from app.config import settings
from app.main import app
from app.auth import create_scoped_token


def _write_upload(deal_id: str, filename: str) -> str:
    path = os.path.join(settings.uploads_dir, deal_id)
    os.makedirs(path, exist_ok=True)
    return os.path.join(path, filename)


@pytest.fixture
def evil_xlsx(sample_deal):
    """Workbook with a script payload in a cell and an HTML-ish sheet name."""
    file_path = _write_upload(sample_deal.deal_id, "evil.xlsx")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "<img src=x onerror=1>"
    ws.append(["Header", "<script>alert(1)</script>"])
    ws.append(["Value", "safe & sound"])
    wb.save(file_path)
    yield "evil.xlsx"
    os.remove(file_path)


def test_excel_preview_escapes_cells_and_sheet_names(client, sample_deal, evil_xlsx):
    res = client.get(f"/deals/{sample_deal.deal_id}/documents/{evil_xlsx}/view")
    assert res.status_code == 200
    body = res.text
    assert "<script>alert(1)</script>" not in body
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in body
    assert "<img src=x onerror=1>" not in body
    assert "&lt;img src=x onerror=1&gt;" in body


def test_excel_preview_has_csp_and_nosniff(client, sample_deal, evil_xlsx):
    res = client.get(f"/deals/{sample_deal.deal_id}/documents/{evil_xlsx}/view")
    assert res.headers.get("x-content-type-options") == "nosniff"
    csp = res.headers.get("content-security-policy", "")
    assert "default-src 'none'" in csp


def test_unknown_type_served_as_attachment(client, sample_deal):
    """A renamed HTML file must not render inline in the app origin."""
    file_path = _write_upload(sample_deal.deal_id, "sneaky.html")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("<script>document.title='owned'</script>")
    try:
        res = client.get(f"/deals/{sample_deal.deal_id}/documents/sneaky.html/view")
        assert res.status_code == 200
        disposition = res.headers.get("content-disposition", "")
        assert disposition.startswith("attachment")
        assert res.headers.get("x-content-type-options") == "nosniff"
        assert "text/html" not in res.headers.get("content-type", "")
    finally:
        os.remove(file_path)


def test_text_types_stay_inline_with_nosniff(client, sample_deal):
    file_path = _write_upload(sample_deal.deal_id, "notes.txt")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("plain notes")
    try:
        res = client.get(f"/deals/{sample_deal.deal_id}/documents/notes.txt/view")
        assert res.status_code == 200
        assert res.headers.get("content-disposition", "").startswith("inline")
        assert res.headers.get("x-content-type-options") == "nosniff"
    finally:
        os.remove(file_path)

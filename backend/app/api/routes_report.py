"""
IC Report generation endpoint — accepts pre-computed workstream results
and returns a formatted Word document.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.report import ICReportRequest
from app.services.report_generator import generate_ic_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/ic")
async def create_ic_report(request: ICReportRequest):
    """Generate an Investment Committee report as a DOCX download.

    Accepts pre-computed deal/workstream results from the frontend and
    formats them into a professional Word document with footnoted citations.
    """
    if not request.deals:
        raise HTTPException(status_code=400, detail="At least one deal is required")

    for deal in request.deals:
        if not deal.workstreams:
            raise HTTPException(
                status_code=400,
                detail=f"Deal '{deal.name}' has no workstream results to include",
            )

    buf = generate_ic_report(request)

    # Build filename
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if len(request.deals) == 1:
        slug = request.deals[0].name.replace(" ", "-")[:30]
        filename = f"IC-Report-{slug}-{date_str}.docx"
    else:
        filename = f"IC-Report-{len(request.deals)}-Deals-{date_str}.docx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )

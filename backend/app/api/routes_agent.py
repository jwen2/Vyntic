"""
Diligence Agent SSE endpoints (Investigate feature).
Mounted only when settings.agentic_features is true.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.agents.diligence_agent import run_investigation
from app.agents.followup_agent import run_followup
from app.auth import get_current_user, require_deal_access
from app.database import UserRow
from app.models.agent import FollowupRequest, InvestigationRequest
from app.services import deal_store, investigation_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/deals", tags=["agent"])


@router.post("/{deal_id}/investigate/stream")
async def investigate_stream(
    deal_id: str,
    request: InvestigationRequest,
    current_user: UserRow = Depends(get_current_user),
):
    """Server-Sent-Events stream of an autonomous diligence investigation."""
    require_deal_access(current_user, deal_id)
    if not deal_store.get_deal(deal_id):
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    investigation_id = investigation_store.create_investigation(
        deal_id=deal_id,
        user_id=current_user.id,
        goal=request.goal or "",
    )

    async def event_generator():
        transcript: list[dict] = []
        findings: list[dict] = []
        evidence: list[dict] = []
        memo = ""
        model = ""
        fallback = False
        duration_ms = 0
        status = "running"
        try:
            async for event in run_investigation(
                deal_id, request.goal, investigation_id=investigation_id,
            ):
                # Record every event in the transcript for replay.
                transcript.append(event)
                etype = event.get("type")
                if etype == "finding":
                    findings.append({k: v for k, v in event.items() if k != "type"})
                elif etype == "done":
                    memo = event.get("memo", "") or memo
                    findings = event.get("findings", findings) or findings
                    evidence = event.get("evidence", evidence) or evidence
                    model = event.get("model", "") or model
                    fallback = bool(event.get("fallback", False) or fallback)
                    duration_ms = int(event.get("duration_ms", 0) or duration_ms)
                    status = "complete"
                elif etype == "error":
                    status = "error"
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.CancelledError:
            status = "stopped"
            raise
        except Exception as e:
            logger.exception("investigation failed")
            status = "error"
            err_ev = {"type": "error", "error": str(e)}
            transcript.append(err_ev)
            yield f"data: {json.dumps(err_ev)}\n\n"
        finally:
            # Pull evidence from the agent's accumulated state if we can.
            # It's also embedded within transcript tool_result events, but
            # we persist the transcript verbatim so replay is faithful.
            try:
                investigation_store.finalize_investigation(
                    investigation_id,
                    status=status,
                    memo=memo,
                    findings=findings,
                    transcript=transcript,
                    evidence=evidence,
                    model=model,
                    fallback=fallback,
                    duration_ms=duration_ms,
                )
            except Exception:
                logger.exception("failed to persist investigation %s", investigation_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{deal_id}/investigations")
async def list_deal_investigations(
    deal_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    """List prior investigations for this deal (summaries only)."""
    require_deal_access(current_user, deal_id)
    if not deal_store.get_deal(deal_id):
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return investigation_store.list_investigations(deal_id, user_id=current_user.id)


@router.get("/{deal_id}/investigations/{investigation_id}")
async def get_deal_investigation(
    deal_id: str,
    investigation_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    """Fetch full investigation record incl. transcript and follow-ups."""
    require_deal_access(current_user, deal_id)
    record = investigation_store.get_investigation(investigation_id)
    if not record or record["deal_id"] != deal_id:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return record


@router.delete("/{deal_id}/investigations/{investigation_id}")
async def delete_deal_investigation(
    deal_id: str,
    investigation_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    record = investigation_store.get_investigation(investigation_id)
    if not record or record["deal_id"] != deal_id:
        raise HTTPException(status_code=404, detail="Investigation not found")
    ok = investigation_store.delete_investigation(investigation_id)
    return {"ok": ok}


@router.post("/{deal_id}/investigations/{investigation_id}/followup/stream")
async def followup_stream(
    deal_id: str,
    investigation_id: str,
    request: FollowupRequest,
    current_user: UserRow = Depends(get_current_user),
):
    """Stream a follow-up answer grounded in the investigation's memo/findings/evidence."""
    require_deal_access(current_user, deal_id)
    record = investigation_store.get_investigation(investigation_id)
    if not record or record["deal_id"] != deal_id:
        raise HTTPException(status_code=404, detail="Investigation not found")
    if record["status"] == "running":
        raise HTTPException(status_code=409, detail="Investigation still running")

    deal = deal_store.get_deal(deal_id)
    deal_name = deal.name if deal else deal_id

    # Persist the user turn immediately so the thread survives disconnects.
    investigation_store.append_followup(
        investigation_id, role="user", content=request.question,
    )

    # Grab prior turns AFTER inserting the user turn so the model sees it in history,
    # but exclude the just-inserted user turn (we append it as the final HumanMessage).
    fresh = investigation_store.get_investigation(investigation_id) or {}
    prior_turns = (fresh.get("followups") or [])[:-1]

    async def event_generator():
        answer = ""
        model = ""
        fallback = False
        duration_ms = 0
        try:
            async for event in run_followup(
                deal_name=deal_name,
                deal_id=deal_id,
                goal=record.get("goal", ""),
                memo=record.get("memo", ""),
                findings=record.get("findings", []),
                evidence=record.get("evidence", []),
                prior_turns=prior_turns,
                question=request.question,
            ):
                if event.get("type") == "done":
                    answer = event.get("content", "") or answer
                    model = event.get("model", "") or model
                    fallback = bool(event.get("fallback", False))
                    duration_ms = int(event.get("duration_ms", 0) or 0)
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logger.exception("follow-up failed")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            if answer:
                investigation_store.append_followup(
                    investigation_id,
                    role="assistant",
                    content=answer,
                    model=model,
                    fallback=fallback,
                    duration_ms=duration_ms,
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

"""Matrix comparison routes — the core multi-deal comparison endpoint."""
import asyncio
from fastapi import APIRouter, HTTPException

from app.models.matrix import MatrixRequest, MatrixResponse, CellData
from app.services import deal_store
from app.agents.comparison_graph import compare_deals

router = APIRouter(prefix="/matrix", tags=["matrix"])


@router.post("/compare", response_model=MatrixResponse)
async def matrix_compare(request: MatrixRequest):
    """
    Compare multiple deals across multiple queries.
    Returns a matrix: cells[deal_id][query] = CellData.
    Each query triggers a parallel fan-out to all deal namespaces.
    """
    # Validate all deals exist
    for deal_id in request.deal_ids:
        if not deal_store.get_deal(deal_id):
            raise HTTPException(
                status_code=404,
                detail=f"Deal '{deal_id}' not found"
            )

    if not request.queries:
        raise HTTPException(status_code=400, detail="At least one query is required")

    # Run all queries in parallel
    async def run_query(query: str) -> tuple[str, dict[str, CellData]]:
        try:
            cells = await compare_deals(request.deal_ids, query)
            return query, cells
        except Exception as e:
            # Return error cells for this query
            error_cells = {
                did: CellData(
                    answer=f"Error: {str(e)}",
                    citations=[],
                    status="error",
                )
                for did in request.deal_ids
            }
            return query, error_cells

    results = await asyncio.gather(
        *[run_query(q) for q in request.queries]
    )

    # Build the matrix: cells[deal_id][query] = CellData
    matrix_cells: dict[str, dict[str, CellData]] = {
        did: {} for did in request.deal_ids
    }

    for query, cells in results:
        for deal_id, cell_data in cells.items():
            matrix_cells[deal_id][query] = cell_data

    return MatrixResponse(cells=matrix_cells)

"""Manager (GP firm) CRUD routes + manager-scoped document listing.

Access model mirrors deals: any authenticated user can list managers
(consistent with GET /deals), mutations are admin-only, and document-level
reads require access to at least one of the manager's funds.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.models.deal import Deal
from app.models.document import DocumentMetadata
from app.models.manager import Manager, ManagerCreate, ManagerUpdate
from app.services import deal_store, manager_store
from app.database import UserRow
from app.auth import get_current_user, require_admin, verify_deal_access

router = APIRouter(prefix="/managers", tags=["managers"])


def _require_any_fund_access(user: UserRow, manager_id: str) -> None:
    """403 unless the user can access at least one fund of this manager.

    Admins bypass. A manager with no funds is only visible to admins at the
    document level (there is nothing to read anyway).
    """
    if user.is_admin:
        return
    for fund_id in manager_store.list_fund_ids(manager_id):
        try:
            verify_deal_access(user, fund_id)
            return
        except HTTPException:
            continue
    raise HTTPException(
        status_code=403,
        detail=f"You do not have access to any fund of manager '{manager_id}'",
    )


@router.post("", response_model=Manager)
def create_manager(data: ManagerCreate, current_user: UserRow = Depends(get_current_user)):
    require_admin(current_user)
    try:
        return manager_store.create_manager(data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=list[Manager])
def list_managers(current_user: UserRow = Depends(get_current_user)):
    return manager_store.list_managers()


@router.get("/{manager_id}", response_model=Manager)
def get_manager(manager_id: str, current_user: UserRow = Depends(get_current_user)):
    manager = manager_store.get_manager(manager_id)
    if not manager:
        raise HTTPException(status_code=404, detail=f"Manager '{manager_id}' not found")
    return manager


@router.patch("/{manager_id}", response_model=Manager)
def update_manager(
    manager_id: str,
    data: ManagerUpdate,
    current_user: UserRow = Depends(get_current_user),
):
    require_admin(current_user)
    manager = manager_store.update_manager(manager_id, data)
    if not manager:
        raise HTTPException(status_code=404, detail=f"Manager '{manager_id}' not found")
    return manager


@router.delete("/{manager_id}")
def delete_manager(manager_id: str, current_user: UserRow = Depends(get_current_user)):
    """Delete a manager. Funds are detached, not deleted."""
    require_admin(current_user)
    if not manager_store.delete_manager(manager_id):
        raise HTTPException(status_code=404, detail=f"Manager '{manager_id}' not found")
    return {"status": "deleted", "manager_id": manager_id}


@router.get("/{manager_id}/funds", response_model=list[Deal])
def list_manager_funds(manager_id: str, current_user: UserRow = Depends(get_current_user)):
    if not manager_store.get_manager(manager_id):
        raise HTTPException(status_code=404, detail=f"Manager '{manager_id}' not found")
    funds = [d for d in deal_store.list_deals() if d.manager_id == manager_id]
    if current_user.is_admin:
        return funds
    visible: list[Deal] = []
    for fund in funds:
        try:
            verify_deal_access(current_user, fund.deal_id)
            visible.append(fund)
        except HTTPException:
            continue
    return visible


@router.get("/{manager_id}/documents", response_model=list[DocumentMetadata])
def list_manager_documents(manager_id: str, current_user: UserRow = Depends(get_current_user)):
    """Manager-scoped documents (scope="manager") across the manager's funds."""
    if not manager_store.get_manager(manager_id):
        raise HTTPException(status_code=404, detail=f"Manager '{manager_id}' not found")
    _require_any_fund_access(current_user, manager_id)
    return deal_store.list_manager_documents(manager_id)

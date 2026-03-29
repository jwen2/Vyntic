"""
Authentication routes: register, login, user profile, and deal access management.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import (
    create_access_token,
    verify_password,
    get_current_user,
    get_user_by_email,
    create_user,
    grant_deal_access,
)
from app.database import SessionLocal, UserRow, DealAccessRow

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request/Response schemas ──

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    is_admin: bool


class GrantAccessRequest(BaseModel):
    email: str
    role: str = "analyst"


# ── Endpoints ──

@router.post("/register", response_model=TokenResponse)
def register(request: RegisterRequest):
    """Register a new user account."""
    existing = get_user_by_email(request.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = create_user(
        email=request.email,
        password=request.password,
        full_name=request.full_name,
    )

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin},
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    """Authenticate and return a JWT."""
    user = get_user_by_email(request.email)
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin},
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: UserRow = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_admin=current_user.is_admin,
    )


@router.post("/deals/{deal_id}/access")
def grant_access(
    deal_id: str,
    request: GrantAccessRequest,
    current_user: UserRow = Depends(get_current_user),
):
    """Grant a user access to a deal. Admin only."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    target_user = get_user_by_email(request.email)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{request.email}' not found")

    grant_deal_access(target_user.id, deal_id, request.role)
    return {"status": "granted", "email": request.email, "deal_id": deal_id, "role": request.role}


@router.get("/deals/{deal_id}/access")
def list_access(
    deal_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    """List users with access to a deal. Admin only."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    db = SessionLocal()
    try:
        rows = db.query(DealAccessRow).filter(DealAccessRow.deal_id == deal_id).all()
        result = []
        for r in rows:
            user = db.query(UserRow).filter(UserRow.id == r.user_id).first()
            if user:
                result.append({
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": r.role,
                })
        return result
    finally:
        db.close()

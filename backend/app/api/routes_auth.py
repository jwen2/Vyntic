"""
Authentication routes: register, login, user profile, and deal access management.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from fastapi.security import HTTPAuthorizationCredentials

from app.auth import (
    create_access_token,
    decode_access_token,
    revoke_token,
    security,
    verify_deal_access,
    verify_password,
    get_current_user,
    get_user_by_email,
    create_user,
    grant_deal_access,
)
from app.database import current_session, UserRow, DealAccessRow
from app.rate_limit import limiter, LOGIN_LIMIT, REGISTER_LIMIT
from app.services import audit_store

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

# NOTE: slowapi requires the starlette Request parameter to be named exactly
# `request`, so these two handlers take their JSON body as `payload`.

@router.post("/register", response_model=TokenResponse)
@limiter.limit(REGISTER_LIMIT)
def register(payload: RegisterRequest, request: Request):
    """Register a new user account. Public during beta (decision 2026-07-07);
    rate-limited per IP against junk-account flooding."""
    existing = get_user_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = create_user(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
    )
    audit_store.record(
        user, "auth.register", resource_type="user",
        resource_id=str(user.id), request=request,
    )

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin},
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(LOGIN_LIMIT)
def login(payload: LoginRequest, request: Request):
    """Authenticate and return a JWT. Rate-limited per IP against
    credential stuffing."""
    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    audit_store.record(user, "auth.login", request=request)
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin},
    )


@router.post("/logout")
def logout(
    http_request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    current_user: UserRow = Depends(get_current_user),
):
    """Revoke the current token (S5). It is 401 everywhere afterward, even
    though its expiry has not passed."""
    # get_current_user already validated the credentials; decode again just
    # to extract jti/exp for the blocklist row.
    payload = decode_access_token(credentials.credentials)
    revoke_token(payload)
    audit_store.record(current_user, "auth.logout", request=http_request)
    return {"status": "logged_out"}


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
    http_request: Request,
    current_user: UserRow = Depends(get_current_user),
):
    """Grant a user access to a deal. Admin only, within the admin's tenant:
    the deal must be in-tenant, and a user from another tenant is reported
    as not found (a cross-tenant grant would be inert anyway — the tenant
    gate in verify_deal_access beats access rows — but must not probe
    other tenants' user emails)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    verify_deal_access(current_user, deal_id)

    target_user = get_user_by_email(request.email)
    if not target_user or target_user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail=f"User '{request.email}' not found")

    grant_deal_access(target_user.id, deal_id, request.role)
    audit_store.record(
        current_user, "access.grant", resource_type="user",
        resource_id=str(target_user.id), deal_id=deal_id,
        request=http_request, email=request.email, role=request.role,
    )
    return {"status": "granted", "email": request.email, "deal_id": deal_id, "role": request.role}


@router.get("/deals/{deal_id}/access")
def list_access(
    deal_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    """List users with access to a deal. Admin only, within tenant."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    verify_deal_access(current_user, deal_id)

    db, owned = current_session()
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
        if owned:
            db.close()

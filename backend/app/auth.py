"""
Authentication utilities: JWT token creation/validation, password hashing,
and FastAPI dependency for protecting routes.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt

from app.config import settings
from app.database import (
    current_session,
    UserRow,
    DealAccessRow,
    DealRow,
    RevokedTokenRow,
    DEFAULT_TENANT_ID,
)

# ── Bearer token extraction ──
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ── JWT tokens ──

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    # jti makes the token individually revocable (see revoke_token).
    to_encode.setdefault("jti", uuid.uuid4().hex)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_scoped_token(
    scope: str,
    claims: dict,
    user_id: int,
    expires_delta: timedelta = timedelta(minutes=5),
) -> str:
    """Short-lived single-purpose token (S5). Carried in ?token= query params
    where clients (iframes, EventSource) cannot set headers. The `scope` claim
    marks it: scoped tokens are rejected as session tokens, and session tokens
    are rejected on query params."""
    payload = {
        "scope": scope,
        **claims,
        "sub": str(user_id),
        "jti": uuid.uuid4().hex,
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    jti = payload.get("jti")
    if jti and _is_revoked(jti):
        raise JWTError("Token has been revoked")
    return payload


# ── Revocation (S5) ──

def _is_revoked(jti: str) -> bool:
    db, owned = current_session()
    try:
        return (
            db.query(RevokedTokenRow).filter(RevokedTokenRow.jti == jti).first()
            is not None
        )
    finally:
        if owned:
            db.close()


def revoke_token(payload: dict) -> None:
    """Blocklist a token's jti until it would have expired anyway. Tokens
    minted before the jti rollout can't be revoked individually — they age
    out at the (short) JWT expiry. Piggybacks a prune of expired entries so
    the blocklist doesn't grow unbounded without a scheduler."""
    jti = payload.get("jti")
    if not jti:
        return
    expires_at = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc)
    db, owned = current_session()
    try:
        db.query(RevokedTokenRow).filter(
            RevokedTokenRow.expires_at < datetime.now(timezone.utc).replace(tzinfo=None)
        ).delete()
        if not db.query(RevokedTokenRow).filter(RevokedTokenRow.jti == jti).first():
            db.add(RevokedTokenRow(jti=jti, expires_at=expires_at.replace(tzinfo=None)))
        db.commit()
    finally:
        if owned:
            db.close()


# ── FastAPI dependencies ──

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UserRow:
    """Extract and validate JWT from Authorization header. Returns the UserRow.
    Deliberately sync: FastAPI runs it in the threadpool, keeping the
    per-request user/revocation DB lookups off the event loop."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _resolve_user_from_token(credentials.credentials)


def _load_user(user_id: int) -> UserRow:
    db, owned = current_session()
    try:
        user = db.query(UserRow).filter(UserRow.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Detach so callers get the same plain-object semantics regardless
        # of which session (request-shared or owned) produced the row.
        db.expunge(user)
        return user
    finally:
        if owned:
            db.close()


def _resolve_user_from_token(token: str) -> UserRow:
    """Validate a raw *session* JWT and return the corresponding UserRow.
    Scoped tokens (S5) are rejected here — they are single-purpose and must
    never grant general API access."""
    try:
        payload = decode_access_token(token)
        if payload.get("scope"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Scoped token cannot be used as a session token",
            )
        sub_str = payload.get("sub")
        if sub_str is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        user_id = int(sub_str)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _load_user(user_id)


def scoped_or_header_auth(expected_scope: str, bind_params: tuple[str, ...]):
    """Dependency factory for routes reachable by clients that cannot set
    headers (iframes, EventSource).

    Header path: normal session JWT.
    Query path (?token=): ONLY a scoped token whose `scope` matches and whose
    claims match the route's path params — a session JWT on the query string
    is rejected (S5: long-lived tokens must not land in server logs or
    browser history), and a token minted for one resource cannot be replayed
    against another.
    """

    def dependency(
        request: Request,
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        token: Optional[str] = Query(None),
    ) -> UserRow:
        if credentials is not None:
            return _resolve_user_from_token(credentials.credentials)
        if token is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            payload = decode_access_token(token)
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        if payload.get("scope") != expected_scope:
            raise HTTPException(status_code=401, detail="Token not valid for this resource")
        for name in bind_params:
            if payload.get(name) != request.path_params.get(name):
                raise HTTPException(status_code=401, detail="Token not valid for this resource")
        sub_str = payload.get("sub")
        if sub_str is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return _load_user(int(sub_str))

    return dependency


# Per-route instances for the two header-less surfaces.
doc_view_query_auth = scoped_or_header_auth("doc-view", ("deal_id", "filename"))
run_stream_query_auth = scoped_or_header_auth("run-stream", ("run_id",))


def require_admin(user: UserRow) -> None:
    """Raise 403 unless the user is an admin. Guards the mutations the README
    documents as admin-only: create/delete deals, upload/delete documents,
    edit stage."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


def verify_deal_access(user: UserRow, deal_id: str) -> bool:
    """Check that user has access to the specified deal.

    The tenant boundary comes first and binds everyone: admin means
    tenant-admin, and a stale deal_access row must not reach across
    tenants. Cross-tenant deals return the same 403 as a plain access
    miss so responses do not leak what exists in other tenants.
    Within the tenant, admins bypass per-deal access rows.
    """
    db, owned = current_session()
    try:
        deal_tenant = (
            db.query(DealRow.tenant_id).filter(DealRow.deal_id == deal_id).scalar()
        )
        if deal_tenant is not None and deal_tenant != user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have access to deal '{deal_id}'",
            )

        if user.is_admin:
            return True

        access = db.query(DealAccessRow).filter(
            DealAccessRow.user_id == user.id,
            DealAccessRow.deal_id == deal_id,
        ).first()
        if not access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have access to deal '{deal_id}'",
            )
        return True
    finally:
        if owned:
            db.close()


def require_deal_access(user: UserRow, deal_id: str):
    """Convenience wrapper that raises 403 if user lacks access."""
    verify_deal_access(user, deal_id)


# ── User management helpers ──

def get_user_by_email(email: str) -> Optional[UserRow]:
    db, owned = current_session()
    try:
        user = db.query(UserRow).filter(UserRow.email == email).first()
        if user:
            db.expunge(user)
        return user
    finally:
        if owned:
            db.close()


def create_user(
    email: str,
    password: str,
    full_name: str = "",
    is_admin: bool = False,
    tenant_id: str = DEFAULT_TENANT_ID,
) -> UserRow:
    """Create a user bound to a tenant. Public registration stays on the
    default tenant (beta decision) until invite/provisioning flows exist."""
    db, owned = current_session()
    try:
        user = UserRow(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            is_admin=is_admin,
            tenant_id=tenant_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user
    finally:
        if owned:
            db.close()


def grant_deal_access(user_id: int, deal_id: str, role: str = "analyst"):
    db, owned = current_session()
    try:
        existing = db.query(DealAccessRow).filter(
            DealAccessRow.user_id == user_id,
            DealAccessRow.deal_id == deal_id,
        ).first()
        if existing:
            return  # Already has access
        access = DealAccessRow(user_id=user_id, deal_id=deal_id, role=role)
        db.add(access)
        db.commit()
    finally:
        if owned:
            db.close()

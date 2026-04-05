"""
Authentication utilities: JWT token creation/validation, password hashing,
and FastAPI dependency for protecting routes.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt

from app.config import settings
from app.database import SessionLocal, UserRow, DealAccessRow

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
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


# ── FastAPI dependencies ──

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UserRow:
    """Extract and validate JWT from Authorization header. Returns the UserRow."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
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

    db = SessionLocal()
    try:
        user = db.query(UserRow).filter(UserRow.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Detach from session so it can be used after db.close()
        db.expunge(user)
        return user
    finally:
        db.close()


def _resolve_user_from_token(token: str) -> UserRow:
    """Validate a raw JWT string and return the corresponding UserRow."""
    try:
        payload = decode_access_token(token)
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

    db = SessionLocal()
    try:
        user = db.query(UserRow).filter(UserRow.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        db.expunge(user)
        return user
    finally:
        db.close()


async def get_current_user_or_query_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = Query(None),
) -> UserRow:
    """Authenticate via Authorization header OR ?token= query param.

    Useful for iframe/download URLs where the browser cannot set headers.
    """
    if credentials is not None:
        return _resolve_user_from_token(credentials.credentials)
    if token is not None:
        return _resolve_user_from_token(token)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_deal_access(user: UserRow, deal_id: str) -> bool:
    """Check that user has access to the specified deal. Admins bypass."""
    if user.is_admin:
        return True

    db = SessionLocal()
    try:
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
        db.close()


def require_deal_access(user: UserRow, deal_id: str):
    """Convenience wrapper that raises 403 if user lacks access."""
    verify_deal_access(user, deal_id)


# ── User management helpers ──

def get_user_by_email(email: str) -> Optional[UserRow]:
    db = SessionLocal()
    try:
        user = db.query(UserRow).filter(UserRow.email == email).first()
        if user:
            db.expunge(user)
        return user
    finally:
        db.close()


def create_user(email: str, password: str, full_name: str = "", is_admin: bool = False) -> UserRow:
    db = SessionLocal()
    try:
        user = UserRow(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            is_admin=is_admin,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user
    finally:
        db.close()


def grant_deal_access(user_id: int, deal_id: str, role: str = "analyst"):
    db = SessionLocal()
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
        db.close()

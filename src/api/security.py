"""
Security utilities for JWT authentication and password hashing
"""
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .config import settings
from .db import connection

# API Key prefix
API_KEY_PREFIX = "sk_live_"

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token extractor
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)


def create_access_token(user_id: str, role: str, email: str) -> str:
    """Create a JWT access token"""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "role": role,
        "email": email,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str, token_id: str) -> str:
    """Create a JWT refresh token"""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "jti": token_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token"""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def hash_refresh_token(token: str) -> str:
    """Hash a refresh token for database storage"""
    return hashlib.sha256(token.encode()).hexdigest()


async def _validate_api_key(api_key: str, conn: AsyncConnection) -> Optional[dict]:
    """
    Validate an API key and return user info if valid.
    Returns None if invalid.
    """
    import bcrypt

    if not api_key or not api_key.startswith(API_KEY_PREFIX):
        return None

    key_prefix = api_key[:16]

    async with conn.cursor(row_factory=dict_row) as cur:
        # Find potential matching keys by prefix
        await cur.execute(
            """
            SELECT ak.id, ak.user_id, ak.key_hash, ak.scopes, ak.expires_at, ak.is_active,
                   u.email, u.full_name, u.role, u.is_active as user_is_active
            FROM api_keys ak
            JOIN users u ON u.id = ak.user_id
            WHERE ak.key_prefix = %s AND ak.is_active = TRUE AND u.is_active = TRUE
            """,
            (key_prefix,)
        )
        rows = await cur.fetchall()

        for row in rows:
            # Check expiration
            if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
                continue

            # Verify the key hash
            try:
                if bcrypt.checkpw(api_key.encode(), row["key_hash"].encode()):
                    # Update last_used_at
                    await cur.execute(
                        "UPDATE api_keys SET last_used_at = NOW() WHERE id = %s",
                        (row["id"],)
                    )

                    return {
                        "id": str(row["user_id"]),
                        "email": row["email"],
                        "full_name": row["full_name"],
                        "role": row["role"],
                        "is_active": row["user_is_active"],
                        "scopes": row["scopes"],
                        "auth_type": "api_key",
                        "api_key_id": row["id"]
                    }
            except Exception:
                continue

        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    conn: AsyncConnection = Depends(connection),
) -> dict:
    """
    Dependency to get the current authenticated user from JWT token or API key.
    Returns user dict with id, email, role, full_name, is_active.

    Supports:
    - Authorization: Bearer <jwt_token>
    - Authorization: Bearer <api_key> (if key starts with sk_live_)
    - X-API-Key: <api_key>
    """
    # Try X-API-Key header first
    if x_api_key:
        user = await _validate_api_key(x_api_key, conn)
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    # Check for Bearer token
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Check if it's an API key (starts with sk_live_)
    if token.startswith(API_KEY_PREFIX):
        user = await _validate_api_key(token, conn)
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    # Otherwise, treat as JWT token
    payload = decode_token(token)

    # Verify token type
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch user from database
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT id, email, full_name, role, is_active, locked_until
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )
        user = await cur.fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    if user["locked_until"] and user["locked_until"] > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account locked until {user['locked_until'].isoformat()}",
        )

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    conn: AsyncConnection = Depends(connection),
) -> Optional[dict]:
    """
    Dependency to optionally get the current user.
    Returns None if not authenticated instead of raising an error.
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials, conn)
    except HTTPException:
        return None


def require_role(*allowed_roles: str):
    """
    Dependency factory to require specific roles.
    Usage: user: dict = Depends(require_role("admin", "manager"))
    """
    async def role_checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user['role']}' not authorized. Required: {', '.join(allowed_roles)}",
            )
        return user

    return role_checker


def require_any_role():
    """Dependency that requires any authenticated user"""
    return get_current_user


def require_admin():
    """Dependency that requires admin role"""
    return require_role("admin")


def require_manager_or_above():
    """Dependency that requires manager or admin role"""
    return require_role("manager", "admin")


def require_senior_or_above():
    """Dependency that requires senior_analyst, manager, or admin role"""
    return require_role("senior_analyst", "manager", "admin")

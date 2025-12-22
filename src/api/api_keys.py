"""API Keys management endpoints."""

import secrets
import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from .db import get_pool
from .security import get_current_user
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

# Key prefix for identification
KEY_PREFIX = "sk_live_"


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new API key.
    Returns: (full_key, key_prefix, key_hash)
    """
    # Generate 32 random bytes (256 bits) and encode as hex
    random_part = secrets.token_hex(32)
    full_key = f"{KEY_PREFIX}{random_part}"
    key_prefix = full_key[:16]  # First 16 chars for display

    # Hash the full key with bcrypt
    key_hash = bcrypt.hashpw(full_key.encode(), bcrypt.gensalt()).decode()

    return full_key, key_prefix, key_hash


def verify_api_key(full_key: str, key_hash: str) -> bool:
    """Verify an API key against its hash."""
    try:
        return bcrypt.checkpw(full_key.encode(), key_hash.encode())
    except Exception:
        return False


class ApiKey(BaseModel):
    """API Key model (without the actual key)."""
    id: int
    user_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ApiKeyCreate(BaseModel):
    """API Key creation model."""
    name: str
    scopes: list[str] = ["read"]
    expires_at: Optional[datetime] = None


class ApiKeyCreateResponse(BaseModel):
    """Response when creating an API key (includes the full key once)."""
    id: int
    name: str
    key: str  # Full key - only shown once!
    key_prefix: str
    scopes: list[str]
    expires_at: Optional[datetime] = None
    created_at: datetime


class ApiKeyUpdate(BaseModel):
    """API Key update model."""
    name: Optional[str] = None
    is_active: Optional[bool] = None
    scopes: Optional[list[str]] = None


@router.get("", response_model=list[ApiKey])
async def list_api_keys(current_user: dict = Depends(get_current_user)):
    """List API keys. Users see their own keys, admins see all."""
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            if current_user.get("role") == "admin":
                # Admins see all keys
                await cur.execute(
                    """
                    SELECT id, user_id, name, key_prefix, scopes, last_used_at,
                           expires_at, is_active, created_at, updated_at
                    FROM api_keys
                    ORDER BY created_at DESC
                    """
                )
            else:
                # Users see only their own keys
                await cur.execute(
                    """
                    SELECT id, user_id, name, key_prefix, scopes, last_used_at,
                           expires_at, is_active, created_at, updated_at
                    FROM api_keys
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    """,
                    (current_user["id"],)
                )
            rows = await cur.fetchall()
            return [ApiKey(**{**row, "user_id": str(row["user_id"])}) for row in rows]


@router.post("", response_model=ApiKeyCreateResponse)
async def create_api_key(
    api_key: ApiKeyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new API key. The full key is only shown once in the response."""
    # Validate scopes
    valid_scopes = {"read", "write", "admin"}
    if not all(scope in valid_scopes for scope in api_key.scopes):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scopes. Valid scopes are: {', '.join(valid_scopes)}"
        )

    # Only admins can create keys with admin scope
    if "admin" in api_key.scopes and current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admins can create API keys with admin scope"
        )

    # Generate the key
    full_key, key_prefix, key_hash = generate_api_key()

    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, name, key_prefix, scopes, expires_at, created_at
                """,
                (
                    current_user["id"],
                    api_key.name,
                    key_prefix,
                    key_hash,
                    Jsonb(api_key.scopes),
                    api_key.expires_at
                )
            )
            row = await cur.fetchone()

            return ApiKeyCreateResponse(
                id=row["id"],
                name=row["name"],
                key=full_key,  # Only time the full key is returned!
                key_prefix=row["key_prefix"],
                scopes=row["scopes"],
                expires_at=row["expires_at"],
                created_at=row["created_at"]
            )


@router.get("/{key_id}", response_model=ApiKey)
async def get_api_key(key_id: int, current_user: dict = Depends(get_current_user)):
    """Get a specific API key."""
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, user_id, name, key_prefix, scopes, last_used_at,
                       expires_at, is_active, created_at, updated_at
                FROM api_keys
                WHERE id = %s
                """,
                (key_id,)
            )
            row = await cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="API key not found")

            # Check ownership (admins can view any key)
            if str(row["user_id"]) != current_user["id"] and current_user.get("role") != "admin":
                raise HTTPException(status_code=403, detail="Not authorized to view this key")

            return ApiKey(**{**row, "user_id": str(row["user_id"])})


@router.patch("/{key_id}", response_model=ApiKey)
async def update_api_key(
    key_id: int,
    update: ApiKeyUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an API key (name, active status, or scopes)."""
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Check ownership
            await cur.execute(
                "SELECT user_id FROM api_keys WHERE id = %s",
                (key_id,)
            )
            row = await cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="API key not found")

            if str(row["user_id"]) != current_user["id"] and current_user.get("role") != "admin":
                raise HTTPException(status_code=403, detail="Not authorized to update this key")

            # Validate scopes if provided
            if update.scopes is not None:
                valid_scopes = {"read", "write", "admin"}
                if not all(scope in valid_scopes for scope in update.scopes):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid scopes. Valid scopes are: {', '.join(valid_scopes)}"
                    )
                if "admin" in update.scopes and current_user.get("role") != "admin":
                    raise HTTPException(
                        status_code=403,
                        detail="Only admins can set admin scope"
                    )

            # Build update query
            update_fields = []
            values = []

            if update.name is not None:
                update_fields.append("name = %s")
                values.append(update.name)

            if update.is_active is not None:
                update_fields.append("is_active = %s")
                values.append(update.is_active)

            if update.scopes is not None:
                update_fields.append("scopes = %s")
                values.append(Jsonb(update.scopes))

            if not update_fields:
                raise HTTPException(status_code=400, detail="No fields to update")

            values.append(key_id)
            query = f"""
                UPDATE api_keys
                SET {', '.join(update_fields)}, updated_at = NOW()
                WHERE id = %s
                RETURNING id, user_id, name, key_prefix, scopes, last_used_at,
                          expires_at, is_active, created_at, updated_at
            """

            await cur.execute(query, values)
            row = await cur.fetchone()
            return ApiKey(**{**row, "user_id": str(row["user_id"])})


@router.delete("/{key_id}")
async def delete_api_key(key_id: int, current_user: dict = Depends(get_current_user)):
    """Delete (revoke) an API key."""
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Check ownership
            await cur.execute(
                "SELECT user_id FROM api_keys WHERE id = %s",
                (key_id,)
            )
            row = await cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="API key not found")

            if str(row["user_id"]) != current_user["id"] and current_user.get("role") != "admin":
                raise HTTPException(status_code=403, detail="Not authorized to delete this key")

            await cur.execute("DELETE FROM api_keys WHERE id = %s", (key_id,))
            return {"message": "API key deleted successfully"}


# Function to validate API key (used by auth middleware)
async def validate_api_key(api_key: str) -> Optional[dict]:
    """
    Validate an API key and return the associated user info.
    Returns None if the key is invalid.
    """
    if not api_key or not api_key.startswith(KEY_PREFIX):
        return None

    key_prefix = api_key[:16]

    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Find potential matching keys by prefix
            await cur.execute(
                """
                SELECT ak.id, ak.user_id, ak.key_hash, ak.scopes, ak.expires_at, ak.is_active,
                       u.email, u.full_name, u.role
                FROM api_keys ak
                JOIN users u ON u.id = ak.user_id
                WHERE ak.key_prefix = %s AND ak.is_active = TRUE
                """,
                (key_prefix,)
            )
            rows = await cur.fetchall()

            for row in rows:
                # Check expiration
                if row["expires_at"] and row["expires_at"] < datetime.utcnow():
                    continue

                # Verify the key hash
                if verify_api_key(api_key, row["key_hash"]):
                    # Update last_used_at
                    await cur.execute(
                        "UPDATE api_keys SET last_used_at = NOW() WHERE id = %s",
                        (row["id"],)
                    )
                    await conn.commit()

                    return {
                        "id": str(row["user_id"]),
                        "email": row["email"],
                        "full_name": row["full_name"],
                        "role": row["role"],
                        "scopes": row["scopes"],
                        "auth_type": "api_key",
                        "api_key_id": row["id"]
                    }

            return None

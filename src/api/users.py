"""
User management API endpoints
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .config import settings
from .db import connection
from .models import User, UserCreate, UserUpdate, ResetPasswordRequest, USER_ROLES
from .security import get_current_user, hash_password, require_role

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[User])
async def list_users(
    role: Optional[str] = Query(None, description="Filter by role"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    limit: int = Query(100, le=500),
    conn: AsyncConnection = Depends(connection),
) -> list[User]:
    """List all users with optional filters"""
    conditions = []
    params = []

    if role:
        if role not in USER_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {USER_ROLES}")
        conditions.append("role = %s")
        params.append(role)

    if is_active is not None:
        conditions.append("is_active = %s")
        params.append(is_active)

    where_clause = " AND ".join(conditions) if conditions else "1=1"
    params.append(limit)

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            f"""
            SELECT * FROM users
            WHERE {where_clause}
            ORDER BY full_name ASC
            LIMIT %s
            """,
            params,
        )
        rows = await cur.fetchall()
        return [User(**row) for row in rows]


@router.get("/{user_id}", response_model=User)
async def get_user(
    user_id: UUID,
    conn: AsyncConnection = Depends(connection),
) -> User:
    """Get a specific user by ID"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM users WHERE id = %s",
            (str(user_id),),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return User(**row)


@router.get("/by-email/{email}", response_model=User)
async def get_user_by_email(
    email: str,
    conn: AsyncConnection = Depends(connection),
) -> User:
    """Get a user by email address"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM users WHERE email = %s",
            (email,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return User(**row)


@router.post("", response_model=User, status_code=201)
async def create_user(
    payload: UserCreate,
    current_user: dict = Depends(require_role("admin")),
    conn: AsyncConnection = Depends(connection),
) -> User:
    """Create a new user (admin only)"""
    if payload.role not in USER_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {USER_ROLES}")

    # Validate password
    if len(payload.password) < settings.password_min_length:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {settings.password_min_length} characters",
        )

    async with conn.cursor(row_factory=dict_row) as cur:
        # Check if email already exists
        await cur.execute(
            "SELECT id FROM users WHERE email = %s",
            (payload.email,),
        )
        if await cur.fetchone():
            raise HTTPException(status_code=400, detail="User with this email already exists")

        # Hash password
        password_hash = hash_password(payload.password)

        # Create user
        await cur.execute(
            """
            INSERT INTO users (email, full_name, role, password_hash)
            VALUES (%s, %s, %s, %s)
            RETURNING id, email, full_name, role, is_active, created_at, updated_at
            """,
            (payload.email, payload.full_name, payload.role, password_hash),
        )
        row = await cur.fetchone()
        await conn.commit()
        return User(**row)


@router.patch("/{user_id}", response_model=User)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    conn: AsyncConnection = Depends(connection),
) -> User:
    """Update a user"""
    if payload.role and payload.role not in USER_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {USER_ROLES}")

    async with conn.cursor(row_factory=dict_row) as cur:
        # Check user exists
        await cur.execute(
            "SELECT * FROM users WHERE id = %s",
            (str(user_id),),
        )
        user = await cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check email uniqueness if being changed
        if payload.email and payload.email != user["email"]:
            await cur.execute(
                "SELECT id FROM users WHERE email = %s AND id != %s",
                (payload.email, str(user_id)),
            )
            if await cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already in use")

        # Build update query
        updates = []
        params = []
        update_data = payload.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            if value is not None:
                updates.append(f"{key} = %s")
                params.append(value)

        if not updates:
            return User(**user)

        params.append(str(user_id))

        await cur.execute(
            f"""
            UPDATE users
            SET {", ".join(updates)}
            WHERE id = %s
            RETURNING *
            """,
            params,
        )
        row = await cur.fetchone()
        await conn.commit()
        return User(**row)


@router.delete("/{user_id}", status_code=204)
async def deactivate_user(
    user_id: UUID,
    current_user: dict = Depends(require_role("admin")),
    conn: AsyncConnection = Depends(connection),
):
    """Deactivate a user (soft delete, admin only)"""
    # Prevent self-deactivation
    if str(user_id) == str(current_user["id"]):
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id FROM users WHERE id = %s",
            (str(user_id),),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        await cur.execute(
            "UPDATE users SET is_active = FALSE WHERE id = %s",
            (str(user_id),),
        )
        await conn.commit()


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: UUID,
    payload: ResetPasswordRequest,
    current_user: dict = Depends(require_role("admin")),
    conn: AsyncConnection = Depends(connection),
):
    """Reset a user's password (admin only)"""
    # Validate new password
    if len(payload.new_password) < settings.password_min_length:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {settings.password_min_length} characters",
        )

    async with conn.cursor(row_factory=dict_row) as cur:
        # Check user exists
        await cur.execute(
            "SELECT id FROM users WHERE id = %s",
            (str(user_id),),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Hash and update password
        password_hash = hash_password(payload.new_password)

        await cur.execute(
            """
            UPDATE users
            SET password_hash = %s, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
            WHERE id = %s
            """,
            (password_hash, str(user_id)),
        )

        # Revoke all refresh tokens (force re-login)
        await cur.execute(
            """
            UPDATE refresh_tokens
            SET revoked_at = NOW()
            WHERE user_id = %s AND revoked_at IS NULL
            """,
            (str(user_id),),
        )
        await conn.commit()

    return {"message": "Password reset successfully"}

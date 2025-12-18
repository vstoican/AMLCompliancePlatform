"""
User management API endpoints
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .db import connection
from .models import User, UserCreate, UserUpdate, USER_ROLES

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
    conn: AsyncConnection = Depends(connection),
) -> User:
    """Create a new user"""
    if payload.role not in USER_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {USER_ROLES}")

    async with conn.cursor(row_factory=dict_row) as cur:
        # Check if email already exists
        await cur.execute(
            "SELECT id FROM users WHERE email = %s",
            (payload.email,),
        )
        if await cur.fetchone():
            raise HTTPException(status_code=400, detail="User with this email already exists")

        # Create user
        await cur.execute(
            """
            INSERT INTO users (email, full_name, role)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (payload.email, payload.full_name, payload.role),
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
    conn: AsyncConnection = Depends(connection),
):
    """Deactivate a user (soft delete)"""
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

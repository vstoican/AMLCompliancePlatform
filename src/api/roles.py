"""Roles API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from .db import get_pool
from .auth import get_current_user
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

router = APIRouter(prefix="/roles", tags=["roles"])


class Role(BaseModel):
    """Role model."""
    id: str
    name: str
    description: Optional[str] = None
    permissions: list[str] = []
    color: str = "blue"
    is_system: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RoleCreate(BaseModel):
    """Role creation model."""
    id: str
    name: str
    description: Optional[str] = None
    permissions: list[str] = []
    color: str = "blue"


class RoleUpdate(BaseModel):
    """Role update model."""
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[list[str]] = None
    color: Optional[str] = None


@router.get("", response_model=list[Role])
async def list_roles(current_user: dict = Depends(get_current_user)):
    """List all roles."""
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, name, description, permissions, color, is_system,
                       created_at, updated_at
                FROM roles
                ORDER BY is_system DESC, name ASC
                """
            )
            rows = await cur.fetchall()
            return [Role(**row) for row in rows]


@router.get("/{role_id}", response_model=Role)
async def get_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific role."""
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, name, description, permissions, color, is_system,
                       created_at, updated_at
                FROM roles
                WHERE id = %s
                """,
                (role_id,)
            )
            row = await cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Role not found")
            return Role(**row)


@router.post("", response_model=Role)
async def create_role(role: RoleCreate, current_user: dict = Depends(get_current_user)):
    """Create a new role."""
    # Only admins can create roles
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create roles")

    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Check if role ID already exists
            await cur.execute("SELECT id FROM roles WHERE id = %s", (role.id,))
            if await cur.fetchone():
                raise HTTPException(status_code=400, detail="Role ID already exists")

            await cur.execute(
                """
                INSERT INTO roles (id, name, description, permissions, color, is_system)
                VALUES (%s, %s, %s, %s, %s, FALSE)
                RETURNING id, name, description, permissions, color, is_system,
                          created_at, updated_at
                """,
                (role.id, role.name, role.description, Jsonb(role.permissions), role.color)
            )
            row = await cur.fetchone()
            return Role(**row)


@router.put("/{role_id}", response_model=Role)
async def update_role(
    role_id: str,
    role: RoleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a role."""
    # Only admins can update roles
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update roles")

    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Check if role exists
            await cur.execute("SELECT is_system FROM roles WHERE id = %s", (role_id,))
            existing = await cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Role not found")

            # Build dynamic update query
            update_fields = []
            values = []
            for field, value in role.model_dump(exclude_unset=True).items():
                if field == "permissions":
                    update_fields.append(f"{field} = %s")
                    values.append(Jsonb(value))
                else:
                    update_fields.append(f"{field} = %s")
                    values.append(value)

            if not update_fields:
                raise HTTPException(status_code=400, detail="No fields to update")

            values.append(role_id)
            query = f"""
                UPDATE roles
                SET {', '.join(update_fields)}, updated_at = NOW()
                WHERE id = %s
                RETURNING id, name, description, permissions, color, is_system,
                          created_at, updated_at
            """

            await cur.execute(query, values)
            row = await cur.fetchone()
            return Role(**row)


@router.delete("/{role_id}")
async def delete_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a role."""
    # Only admins can delete roles
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete roles")

    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Check if role exists and is not a system role
            await cur.execute(
                "SELECT is_system FROM roles WHERE id = %s",
                (role_id,)
            )
            existing = await cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Role not found")
            if existing["is_system"]:
                raise HTTPException(status_code=400, detail="Cannot delete system roles")

            # Check if any users have this role
            await cur.execute(
                "SELECT COUNT(*) as count FROM users WHERE role = %s",
                (role_id,)
            )
            count_row = await cur.fetchone()
            if count_row and count_row["count"] > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot delete role: {count_row['count']} users have this role"
                )

            await cur.execute("DELETE FROM roles WHERE id = %s", (role_id,))
            return {"message": "Role deleted successfully"}

"""
Authentication API endpoints
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from pydantic import BaseModel, EmailStr

from .config import settings
from .db import connection
from .security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    hash_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# Request/Response models
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    conn: AsyncConnection = Depends(connection),
):
    """
    Authenticate user with email and password.
    Returns access and refresh tokens.
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        # Fetch user by email
        await cur.execute(
            """
            SELECT id, email, full_name, role, is_active, password_hash,
                   failed_attempts, locked_until
            FROM users
            WHERE email = %s
            """,
            (body.email,),
        )
        user = await cur.fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check if account is locked
    if user["locked_until"] and user["locked_until"] > datetime.now(timezone.utc):
        remaining = (user["locked_until"] - datetime.now(timezone.utc)).seconds // 60
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account locked. Try again in {remaining} minutes.",
        )

    # Check if account is active
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact administrator.",
        )

    # Verify password
    if not verify_password(body.password, user["password_hash"]):
        # Increment failed attempts
        failed_attempts = user["failed_attempts"] + 1
        locked_until = None

        if failed_attempts >= settings.max_failed_attempts:
            locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.lockout_minutes)

        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE users
                SET failed_attempts = %s, locked_until = %s
                WHERE id = %s
                """,
                (failed_attempts, locked_until, user["id"]),
            )
            await conn.commit()

        if locked_until:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Too many failed attempts. Account locked for {settings.lockout_minutes} minutes.",
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Generate tokens
    user_id = str(user["id"])
    token_id = str(uuid4())

    access_token = create_access_token(user_id, user["role"], user["email"])
    refresh_token = create_refresh_token(user_id, token_id)

    # Store refresh token hash in database
    async with conn.cursor() as cur:
        # Reset failed attempts and update last login
        await cur.execute(
            """
            UPDATE users
            SET failed_attempts = 0, locked_until = NULL, last_login = NOW()
            WHERE id = %s
            """,
            (user["id"],),
        )

        # Store refresh token
        await cur.execute(
            """
            INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
            VALUES (%s, %s, %s, %s)
            """,
            (
                token_id,
                user["id"],
                hash_refresh_token(refresh_token),
                datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
            ),
        )
        await conn.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    conn: AsyncConnection = Depends(connection),
):
    """
    Get a new access token using a refresh token.
    """
    # Decode refresh token
    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    token_id = payload.get("jti")

    if not user_id or not token_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Verify refresh token exists and is not revoked
    token_hash = hash_refresh_token(body.refresh_token)

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT rt.id, rt.revoked_at, rt.expires_at,
                   u.id as user_id, u.email, u.role, u.is_active
            FROM refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.id = %s AND rt.token_hash = %s
            """,
            (token_id, token_hash),
        )
        token_record = await cur.fetchone()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if token_record["revoked_at"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    if token_record["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    if not token_record["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Generate new access token
    access_token = create_access_token(
        str(token_record["user_id"]),
        token_record["role"],
        token_record["email"],
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=body.refresh_token,  # Return same refresh token
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    conn: AsyncConnection = Depends(connection),
):
    """
    Revoke a refresh token (logout).
    """
    token_hash = hash_refresh_token(body.refresh_token)

    async with conn.cursor() as cur:
        result = await cur.execute(
            """
            UPDATE refresh_tokens
            SET revoked_at = NOW()
            WHERE token_hash = %s AND revoked_at IS NULL
            RETURNING id
            """,
            (token_hash,),
        )
        revoked = await cur.fetchone()
        await conn.commit()

    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token not found or already revoked",
        )

    return {"message": "Successfully logged out"}


@router.post("/logout-all")
async def logout_all(
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(connection),
):
    """
    Revoke all refresh tokens for the current user (logout from all devices).
    """
    async with conn.cursor() as cur:
        result = await cur.execute(
            """
            UPDATE refresh_tokens
            SET revoked_at = NOW()
            WHERE user_id = %s AND revoked_at IS NULL
            RETURNING id
            """,
            (user["id"],),
        )
        rows = await cur.fetchall()
        await conn.commit()

    return {"message": f"Logged out from {len(rows)} sessions"}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(connection),
):
    """
    Change the current user's password.
    """
    # Validate new password length
    if len(body.new_password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters",
        )

    # Fetch current password hash
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT password_hash FROM users WHERE id = %s",
            (user["id"],),
        )
        user_record = await cur.fetchone()

    if not verify_password(body.current_password, user_record["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # Update password
    new_hash = hash_password(body.new_password)

    async with conn.cursor() as cur:
        await cur.execute(
            """
            UPDATE users
            SET password_hash = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (new_hash, user["id"]),
        )

        # Revoke all refresh tokens (force re-login)
        await cur.execute(
            """
            UPDATE refresh_tokens
            SET revoked_at = NOW()
            WHERE user_id = %s AND revoked_at IS NULL
            """,
            (user["id"],),
        )
        await conn.commit()

    return {"message": "Password changed successfully. Please login again."}


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """
    Get current authenticated user info.
    """
    return UserResponse(
        id=str(user["id"]),
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        is_active=user["is_active"],
    )


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    body: ProfileUpdateRequest,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(connection),
):
    """
    Update current user's profile (full_name, email).
    """
    # Build update query dynamically
    updates = []
    params = []

    if body.full_name is not None:
        if len(body.full_name.strip()) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Full name must be at least 2 characters",
            )
        updates.append("full_name = %s")
        params.append(body.full_name.strip())

    if body.email is not None:
        # Check if email is already taken by another user
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT id FROM users WHERE email = %s AND id != %s",
                (body.email, user["id"]),
            )
            existing = await cur.fetchone()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already in use by another account",
            )
        updates.append("email = %s")
        params.append(body.email)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    updates.append("updated_at = NOW()")
    params.append(user["id"])

    query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s RETURNING id, email, full_name, role, is_active"

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        updated_user = await cur.fetchone()
        await conn.commit()

    return UserResponse(
        id=str(updated_user["id"]),
        email=updated_user["email"],
        full_name=updated_user["full_name"],
        role=updated_user["role"],
        is_active=updated_user["is_active"],
    )

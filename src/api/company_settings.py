"""Company settings API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from .db import get_pool
from .auth import get_current_user
from psycopg.rows import dict_row

router = APIRouter(prefix="/company-settings", tags=["company-settings"])


class CompanySettings(BaseModel):
    """Company settings model."""
    company_name: str
    registration_number: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    compliance_officer_name: Optional[str] = None
    compliance_officer_email: Optional[str] = None
    compliance_officer_phone: Optional[str] = None
    updated_at: Optional[datetime] = None


class CompanySettingsUpdate(BaseModel):
    """Company settings update model."""
    company_name: Optional[str] = None
    registration_number: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    compliance_officer_name: Optional[str] = None
    compliance_officer_email: Optional[str] = None
    compliance_officer_phone: Optional[str] = None


@router.get("", response_model=CompanySettings)
async def get_company_settings(current_user: dict = Depends(get_current_user)):
    """Get company settings."""
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT company_name, registration_number, address_line1, city,
                       postal_code, country, contact_email, contact_phone, website,
                       compliance_officer_name, compliance_officer_email,
                       compliance_officer_phone, updated_at
                FROM company_settings
                WHERE id = 1
                """
            )
            row = await cur.fetchone()
            if not row:
                # Return defaults if no row exists
                return CompanySettings(company_name="AML Compliance Platform")
            return CompanySettings(**row)


@router.put("", response_model=CompanySettings)
async def update_company_settings(
    settings: CompanySettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update company settings."""
    # Only admins can update company settings
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update company settings")

    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Build dynamic update query
            update_fields = []
            values = []
            for field, value in settings.model_dump(exclude_unset=True).items():
                update_fields.append(f"{field} = %s")
                values.append(value)

            if not update_fields:
                raise HTTPException(status_code=400, detail="No fields to update")

            query = f"""
                UPDATE company_settings
                SET {', '.join(update_fields)}, updated_at = NOW()
                WHERE id = 1
                RETURNING company_name, registration_number, address_line1, city,
                          postal_code, country, contact_email, contact_phone, website,
                          compliance_officer_name, compliance_officer_email,
                          compliance_officer_phone, updated_at
            """

            await cur.execute(query, values)
            row = await cur.fetchone()
            return CompanySettings(**row)

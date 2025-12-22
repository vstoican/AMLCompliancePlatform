"""Notifications API endpoints - fetches from NATS JetStream."""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .db import connection
from .events import get_recent_notifications
from .security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])


class Notification(BaseModel):
    """Notification model for API response."""
    id: str
    type: str
    title: str
    message: str
    severity: str
    timestamp: str
    read: bool = False
    data: Optional[dict] = None


class NotificationsResponse(BaseModel):
    """Response containing list of notifications."""
    notifications: list[Notification]
    count: int
    unread_count: int


def _format_alert_notification(payload: dict, read: bool = False) -> Notification:
    """Format an alert event payload into a notification."""
    severity = payload.get("severity", "medium")
    scenario = payload.get("scenario", "Unknown")
    alert_type = payload.get("type", "alert")
    customer_id = payload.get("customer_id")
    alert_id = payload.get("alert_id")

    # Build title based on severity
    severity_labels = {
        "critical": "🚨 Critical Alert",
        "high": "⚠️ High Priority Alert",
        "medium": "Alert",
        "low": "Low Priority Alert",
    }
    title = severity_labels.get(severity, "Alert")

    # Build message
    message = f"{scenario}"
    if customer_id:
        message += f" for customer {customer_id[:8]}..."

    return Notification(
        id=f"alert-{payload.get('_seq', datetime.now().timestamp())}",
        type="alert",
        title=title,
        message=message,
        severity=severity,
        timestamp=payload.get("_timestamp") or payload.get("created_at") or datetime.now().isoformat(),
        read=read,
        data={
            "alertId": alert_id,
            "customerId": customer_id,
            "scenario": scenario,
            "alertType": alert_type,
        }
    )


@router.get("", response_model=NotificationsResponse)
async def get_notifications(
    limit: int = Query(50, ge=1, le=100, description="Maximum notifications to return"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """
    Get recent notifications from the last 24 hours.

    Notifications are fetched from NATS JetStream and include alerts
    that have been created. Messages are automatically expired after 24 hours.
    Read status is persisted per user.
    """
    user_id = current_user["id"]

    # Fetch raw notifications from NATS
    raw_notifications = await get_recent_notifications(limit=limit)

    # Get read notification IDs for this user
    read_ids = set()
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT notification_id FROM notification_reads WHERE user_id = %s",
            (user_id,)
        )
        rows = await cur.fetchall()
        read_ids = {row["notification_id"] for row in rows}

    notifications = []
    for payload in raw_notifications:
        try:
            subject = payload.get("_subject", "")

            # Format based on subject type
            if "alert" in subject:
                notification_id = f"alert-{payload.get('_seq', '')}"
                is_read = notification_id in read_ids
                notifications.append(_format_alert_notification(payload, read=is_read))

        except Exception as e:
            logger.error(f"Error formatting notification: {e}")
            continue

    unread_count = sum(1 for n in notifications if not n.read)

    return NotificationsResponse(
        notifications=notifications,
        count=len(notifications),
        unread_count=unread_count
    )


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Mark a single notification as read."""
    user_id = current_user["id"]

    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO notification_reads (user_id, notification_id)
            VALUES (%s, %s)
            ON CONFLICT (user_id, notification_id) DO NOTHING
            """,
            (user_id, notification_id)
        )

    return {"success": True, "notification_id": notification_id}


@router.post("/read-all")
async def mark_all_notifications_read(
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Mark all current notifications as read."""
    user_id = current_user["id"]

    # Fetch current notification IDs from NATS
    raw_notifications = await get_recent_notifications(limit=100)

    notification_ids = []
    for payload in raw_notifications:
        subject = payload.get("_subject", "")
        if "alert" in subject:
            notification_ids.append(f"alert-{payload.get('_seq', '')}")

    if notification_ids:
        async with conn.cursor() as cur:
            # Batch insert
            for nid in notification_ids:
                await cur.execute(
                    """
                    INSERT INTO notification_reads (user_id, notification_id)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id, notification_id) DO NOTHING
                    """,
                    (user_id, nid)
                )

    return {"success": True, "count": len(notification_ids)}

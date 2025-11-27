import asyncio
from typing import Any

from nats.aio.client import Client as NATS

from .config import settings


async def publish_event(subject: str, payload: dict[str, Any]) -> None:
    """
    Fire-and-forget helper to push events to NATS. If the broker is unavailable
    the exception is suppressed to keep the API responsive.
    """
    try:
        nc = NATS()
        await nc.connect(servers=[settings.nats_url], connect_timeout=1)
        await nc.publish(subject, str(payload).encode())
        await nc.drain()
    except Exception:
        # Best-effort only
        return

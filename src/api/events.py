import asyncio
import json
import logging
from typing import Any, Optional

from nats.aio.client import Client as NATS
from nats.js import JetStreamContext
from nats.js.api import RetentionPolicy, StorageType, StreamConfig

from .config import settings

logger = logging.getLogger(__name__)


class JetStreamPublisher:
    """
    Reliable event publisher using NATS JetStream.
    Guarantees at-least-once delivery with persistence.
    """

    def __init__(self):
        self.nc: Optional[NATS] = None
        self.js: Optional[JetStreamContext] = None
        self._connected = False
        self._connecting_lock = asyncio.Lock()

    async def connect(self) -> bool:
        """Connect to NATS and setup JetStream"""
        async with self._connecting_lock:
            if self._connected and self.nc and not self.nc.is_closed:
                return True

            try:
                self.nc = NATS()
                await self.nc.connect(servers=[settings.nats_url], max_reconnect_attempts=10)
                self.js = self.nc.jetstream()

                # Create stream for AML events (idempotent)
                await self._ensure_stream()

                self._connected = True
                logger.info("✅ Connected to NATS JetStream")
                return True

            except Exception as e:
                logger.error(f"❌ Failed to connect to NATS JetStream: {e}")
                self._connected = False
                return False

    async def _ensure_stream(self):
        """Create AML_EVENTS stream if it doesn't exist"""
        try:
            # Try to get existing stream info
            try:
                await self.js.stream_info("AML_EVENTS")
                logger.info("Stream AML_EVENTS already exists")
                return
            except Exception:
                # Stream doesn't exist, create it
                pass

            # Create stream with storage configuration
            # Note: Using dict for config compatibility with nats-py 2.7.2
            await self.js.add_stream(
                name="AML_EVENTS",
                subjects=["aml.>"],
                retention="limits",
                max_age=30 * 24 * 60 * 60,  # 30 days in seconds
                max_bytes=2 * 1024 * 1024 * 1024,  # 2GB
                storage="file",  # Persist to disk
            )
            logger.info("✅ Created JetStream stream: AML_EVENTS (30d retention, 2GB, file storage)")

        except Exception as e:
            logger.error(f"Failed to ensure stream: {e}")
            raise

    async def publish_event(self, subject: str, payload: dict[str, Any]) -> bool:
        """
        Publish event with guaranteed delivery.

        Args:
            subject: NATS subject (e.g., "aml.transaction.ingested")
            payload: Event data as dict

        Returns:
            bool: True if published successfully, False otherwise
        """
        # Ensure connected
        if not self._connected or not self.js:
            connected = await self.connect()
            if not connected:
                logger.error(f"❌ Cannot publish {subject}: Not connected to JetStream")
                return False

        try:
            # Publish with acknowledgment
            ack = await self.js.publish(
                subject=subject,
                payload=json.dumps(payload).encode("utf-8"),
                timeout=5.0,  # Wait up to 5 seconds for ack
            )

            # Verify acknowledgment
            if ack and ack.seq > 0:
                logger.info(f"✅ Published {subject} (seq: {ack.seq})")
                return True
            else:
                logger.error(f"❌ Failed to publish {subject}: No acknowledgment")
                return False

        except asyncio.TimeoutError:
            logger.error(f"❌ Timeout publishing {subject}")
            return False
        except Exception as e:
            logger.error(f"❌ Error publishing {subject}: {e}")
            return False

    async def close(self):
        """Close NATS connection gracefully"""
        if self.nc and not self.nc.is_closed:
            try:
                await self.nc.drain()
                await self.nc.close()
                logger.info("Closed NATS JetStream connection")
            except Exception as e:
                logger.error(f"Error closing NATS connection: {e}")
        self._connected = False


# Global publisher instance
_publisher = JetStreamPublisher()


async def publish_event(subject: str, payload: dict[str, Any]) -> bool:
    """
    Publish event to JetStream with guaranteed delivery.

    Args:
        subject: NATS subject (e.g., "aml.transaction.ingested")
        payload: Event data as dict

    Returns:
        bool: True if published successfully, False otherwise
    """
    success = await _publisher.publish_event(subject, payload)

    if not success:
        # Log failed event for manual review/retry
        logger.error(
            f"⚠️ FAILED TO PUBLISH EVENT - Manual review required: "
            f"subject={subject}, payload={json.dumps(payload)}"
        )

    return success


async def connect_jetstream():
    """Initialize JetStream connection (call on startup)"""
    return await _publisher.connect()


async def close_jetstream():
    """Close JetStream connection (call on shutdown)"""
    await _publisher.close()

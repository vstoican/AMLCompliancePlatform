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
        """Create or update AML_EVENTS stream"""
        try:
            # Stream configuration
            stream_config = {
                "name": "AML_EVENTS",
                "subjects": ["aml.>"],
                "retention": "limits",
                "max_age": 24 * 60 * 60,  # 24 hours in seconds
                "max_bytes": 512 * 1024 * 1024,  # 512MB
                "storage": "file",  # Persist to disk
            }

            # Try to get existing stream info
            try:
                info = await self.js.stream_info("AML_EVENTS")
                # Stream exists, update it with new config
                await self.js.update_stream(**stream_config)
                logger.info("✅ Updated JetStream stream: AML_EVENTS (24h retention, 512MB)")
                return
            except Exception:
                # Stream doesn't exist, create it
                pass

            # Create stream with storage configuration
            await self.js.add_stream(**stream_config)
            logger.info("✅ Created JetStream stream: AML_EVENTS (24h retention, 512MB, file storage)")

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


async def get_recent_notifications(limit: int = 50) -> list[dict[str, Any]]:
    """
    Fetch recent alert notifications from JetStream.

    Args:
        limit: Maximum number of notifications to return

    Returns:
        List of notification payloads, newest first
    """
    if not _publisher._connected or not _publisher.js:
        connected = await _publisher.connect()
        if not connected:
            logger.error("Cannot fetch notifications: Not connected to JetStream")
            return []

    notifications = []

    try:
        # Create an ephemeral consumer to read recent messages
        # DeliverLastPerSubject would give us the latest, but we want recent history
        psub = await _publisher.js.pull_subscribe(
            "aml.alert.>",
            durable=None,  # Ephemeral consumer
            stream="AML_EVENTS",
        )

        try:
            # Fetch messages (this will get from the beginning of the stream)
            messages = await psub.fetch(batch=limit, timeout=2.0)

            for msg in messages:
                try:
                    payload = json.loads(msg.data.decode("utf-8"))
                    # Add metadata
                    payload["_seq"] = msg.metadata.sequence.stream
                    payload["_timestamp"] = msg.metadata.timestamp.isoformat() if msg.metadata.timestamp else None
                    payload["_subject"] = msg.subject
                    notifications.append(payload)
                    # Acknowledge the message for this ephemeral consumer
                    await msg.ack()
                except Exception as e:
                    logger.error(f"Error parsing notification message: {e}")
                    continue

        except asyncio.TimeoutError:
            # No messages available, that's okay
            pass
        finally:
            # Clean up the ephemeral subscription
            await psub.unsubscribe()

    except Exception as e:
        logger.error(f"Error fetching notifications from JetStream: {e}")

    # Return newest first
    notifications.reverse()
    return notifications[:limit]

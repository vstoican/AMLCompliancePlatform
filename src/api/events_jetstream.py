"""
Reliable event publishing using NATS JetStream
Guarantees at-least-once delivery with persistence
"""
import json
from typing import Any

from nats.aio.client import Client as NATS
from nats.js import JetStreamContext
from nats.js.api import StreamConfig, RetentionPolicy

from .config import settings


class EventPublisher:
    """Reliable event publisher using JetStream"""

    def __init__(self):
        self.nc: NATS = None
        self.js: JetStreamContext = None

    async def connect(self):
        """Connect to NATS and setup JetStream"""
        self.nc = NATS()
        await self.nc.connect(servers=[settings.nats_url])
        self.js = self.nc.jetstream()

        # Create stream for AML events (if not exists)
        try:
            await self.js.add_stream(
                name="AML_EVENTS",
                subjects=["aml.>"],  # All aml.* subjects
                retention=RetentionPolicy.LIMITS,
                max_age=30 * 24 * 60 * 60,  # 30 days retention
                max_bytes=1024 * 1024 * 1024,  # 1GB max
                storage="file",  # Persist to disk
                num_replicas=1,  # Single replica (increase for HA)
            )
        except Exception:
            # Stream might already exist
            pass

    async def publish_event(self, subject: str, payload: dict[str, Any]) -> bool:
        """
        Publish event with guaranteed delivery

        Returns:
            bool: True if published successfully, False otherwise
        """
        if not self.js:
            await self.connect()

        try:
            # Publish with acknowledgment
            ack = await self.js.publish(
                subject,
                json.dumps(payload).encode(),
                timeout=5.0,  # Wait for ack
            )

            # Verify published
            if ack and ack.seq > 0:
                return True

            return False

        except Exception as e:
            # Log error but don't crash API
            print(f"Failed to publish event {subject}: {e}")
            return False

    async def close(self):
        """Close NATS connection"""
        if self.nc:
            await self.nc.drain()
            await self.nc.close()


# Global publisher instance
_publisher = EventPublisher()


async def publish_event_reliable(subject: str, payload: dict[str, Any]) -> bool:
    """
    Publish event with JetStream guarantees

    Returns:
        bool: True if published successfully, False otherwise
    """
    return await _publisher.publish_event(subject, payload)


async def cleanup_publisher():
    """Cleanup on shutdown"""
    await _publisher.close()
